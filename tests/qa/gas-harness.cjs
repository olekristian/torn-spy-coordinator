const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

class FakeRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  descriptor(op, extra = {}) {
    const header = this.row > 1 && this.numRows === 1 && this.numColumns === 1
      ? String(this.sheet.cell(1, this.column) || '')
      : '';
    return {
      op,
      sheet: this.sheet.name,
      row: this.row,
      column: this.column,
      numRows: this.numRows,
      numColumns: this.numColumns,
      header,
      ...extra,
    };
  }

  getValues() {
    const values = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const row = [];
      for (let c = 0; c < this.numColumns; c += 1) {
        row.push(this.sheet.cell(this.row + r, this.column + c));
      }
      values.push(row);
    }
    this.sheet.env.emit(this.descriptor('getValues', { phase: 'afterSnapshot', values }));
    return values.map(row => row.slice());
  }

  setValues(values) {
    this.sheet.env.emit(this.descriptor('setValues', { phase: 'before', values }));
    for (let r = 0; r < this.numRows; r += 1) {
      for (let c = 0; c < this.numColumns; c += 1) {
        this.sheet.setCell(this.row + r, this.column + c, values[r][c]);
      }
    }
    this.sheet.env.emit(this.descriptor('setValues', { phase: 'after', values }));
    return this;
  }

  setValue(value) {
    this.sheet.env.emit(this.descriptor('setValue', { phase: 'before', value }));
    this.sheet.setCell(this.row, this.column, value);
    this.sheet.env.emit(this.descriptor('setValue', { phase: 'after', value }));
    return this;
  }
}

class FakeSheet {
  constructor(name, env) {
    this.name = name;
    this.env = env;
    this.data = [];
  }

  cell(row, column) {
    return this.data[row - 1]?.[column - 1] ?? '';
  }

  setCell(row, column, value) {
    while (this.data.length < row) this.data.push([]);
    while (this.data[row - 1].length < column) this.data[row - 1].push('');
    this.data[row - 1][column - 1] = value;
  }

  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i -= 1) {
      if (this.data[i].some(value => value !== '')) return i + 1;
    }
    return 0;
  }

  getName() {
    return this.name;
  }

  getLastColumn() {
    return this.data.reduce((max, row) => Math.max(max, row.length), 0);
  }

  getRange(row, column, numRows = 1, numColumns = 1) {
    return new FakeRange(this, row, column, numRows, numColumns);
  }

  getDataRange() {
    return this.getRange(
      1,
      1,
      Math.max(this.getLastRow(), 1),
      Math.max(this.getLastColumn(), 1),
    );
  }

  appendRow(values) {
    this.env.emit({ op: 'appendRow', phase: 'before', sheet: this.name, values });
    const row = values.slice();
    this.data.push(row);
    this.env.emit({
      op: 'appendRow',
      phase: 'after',
      sheet: this.name,
      row: this.data.length,
      values: row,
    });
    return this;
  }
}

class FakeSpreadsheet {
  constructor(env) {
    this.env = env;
    this.sheets = new Map();
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this.env);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function createHarness(options = {}) {
  const env = {
    hook: null,
    sends: [],
    sleeps: [],
    uuid: 0,
    lockHeld: false,
    properties: new Map(Object.entries({
      API_KEY: 'employee-key',
      ADMIN_KEY: 'admin-key',
      EMPLOYEE_ACCESS_MAP: JSON.stringify({
        'employee-key': 'Employee A',
        'employee-b-key': 'Employee B',
      }),
      TORN_COMPANY_ID: '12345',
      SESSION_SECRET: 'qa-session-secret-with-sufficient-entropy',
      ...(options.properties || {}),
    })),
    emit(event) {
      if (this.hook) this.hook(event);
    },
  };
  const spreadsheet = new FakeSpreadsheet(env);
  const contentService = {
    MimeType: { JSON: 'application/json', JAVASCRIPT: 'text/javascript' },
    createTextOutput(text) {
      return {
        text,
        mimeType: '',
        setMimeType(mimeType) {
          this.mimeType = mimeType;
          return this;
        },
        getContent() {
          return this.text;
        },
      };
    },
  };
  const context = {
    console,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Date,
    Array,
    Object,
    RegExp,
    Error,
    Set,
    Map,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return env.properties.get(key) || '';
          },
          setProperty(key, value) {
            env.properties.set(key, String(value));
          },
        };
      },
    },
    SpreadsheetApp: {
      getActive() {
        return spreadsheet;
      },
      flush() {},
    },
    LockService: {
      getScriptLock() {
        let acquired = false;
        return {
          tryLock() {
            if (env.lockHeld) return false;
            env.lockHeld = true;
            acquired = true;
            return true;
          },
          hasLock() {
            return acquired && env.lockHeld;
          },
          releaseLock() {
            if (acquired) env.lockHeld = false;
            acquired = false;
          },
        };
      },
    },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      getUuid() {
        env.uuid += 1;
        return env.uuid.toString(16).padStart(8, '0') + '-0000-0000-0000-000000000000';
      },
      sleep(ms) {
        env.sleeps.push(ms);
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(value).toString('base64url');
      },
      base64DecodeWebSafe(value) {
        return [...Buffer.from(String(value), 'base64url')];
      },
      computeHmacSha256Signature(value, key) {
        return [...crypto.createHmac('sha256', String(key)).update(String(value), 'utf8').digest()];
      },
      newBlob(value) {
        const bytes = Buffer.from(value);
        return { getDataAsString: () => bytes.toString('utf8') };
      },
    },
    UrlFetchApp: {
      fetch(url, request) {
        env.emit({ op: 'urlFetch', phase: 'before', url, request });
        const response = options.urlFetchResponse
          ? options.urlFetchResponse(url, request, env)
          : { code: 204, body: '', headers: {} };
        env.sends.push({ url, request, response });
        env.emit({ op: 'urlFetch', phase: 'after', url, request, response });
        return {
          getResponseCode: () => response.code,
          getContentText: () => response.body || '',
          getAllHeaders: () => response.headers || {},
        };
      },
    },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      AuthorizationStatus: { NOT_REQUIRED: 'NOT_REQUIRED' },
      getAuthorizationInfo() {
        return {
          getAuthorizationStatus: () => 'NOT_REQUIRED',
          getAuthorizationUrl: () => '',
        };
      },
    },
    ContentService: contentService,
  };
  vm.createContext(context);
  const codePath = path.resolve(__dirname, '../../apps-script/Code.gs');
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), context, { filename: codePath });
  context.ensureSheets_();

  function rows(name) {
    return context.readObjects_(name).map(row => ({ ...row }));
  }

  function append(name, object) {
    const previous = env.hook;
    env.hook = null;
    try {
      context.appendObject_(name, object);
    } finally {
      env.hook = previous;
    }
  }

  function request(input, method = 'POST') {
    const event = method === 'POST'
      ? { postData: { contents: JSON.stringify(input) }, parameter: {} }
      : { parameter: { ...input } };
    const output = context.handleRequest(event, method);
    return JSON.parse(output.getContent());
  }

  return {
    context,
    env,
    spreadsheet,
    rows,
    append,
    request,
    setHook(hook) {
      env.hook = hook;
    },
    clearHook() {
      env.hook = null;
    },
    setProperty(key, value) {
      env.properties.set(key, String(value));
    },
  };
}

module.exports = { createHarness };
