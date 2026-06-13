"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/busboy/lib/utils.js
var require_utils = __commonJS({
  "node_modules/busboy/lib/utils.js"(exports2, module2) {
    "use strict";
    function parseContentType(str) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (code !== 47 || i === 0)
            return;
          break;
        }
      }
      if (i === str.length)
        return;
      const type = str.slice(0, i).toLowerCase();
      const subtypeStart = ++i;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (i === subtypeStart)
            return;
          if (parseContentTypeParams(str, i, params) === void 0)
            return;
          break;
        }
      }
      if (i === subtypeStart)
        return;
      const subtype = str.slice(subtypeStart, i).toLowerCase();
      return { type, subtype, params };
    }
    function parseContentTypeParams(str, i, params) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code !== 61)
              return;
            break;
          }
        }
        if (i === str.length)
          return;
        name = str.slice(nameStart, i);
        ++i;
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        if (str.charCodeAt(i) === 34) {
          valueStart = ++i;
          let escaping = false;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 92) {
              if (escaping) {
                valueStart = i;
                escaping = false;
              } else {
                value += str.slice(valueStart, i);
                escaping = true;
              }
              continue;
            }
            if (code === 34) {
              if (escaping) {
                valueStart = i;
                escaping = false;
                continue;
              }
              value += str.slice(valueStart, i);
              break;
            }
            if (escaping) {
              valueStart = i - 1;
              escaping = false;
            }
            if (QDTEXT[code] !== 1)
              return;
          }
          if (i === str.length)
            return;
          ++i;
        } else {
          valueStart = i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (TOKEN[code] !== 1) {
              if (i === valueStart)
                return;
              break;
            }
          }
          value = str.slice(valueStart, i);
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    function parseDisposition(str, defDecoder) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (parseDispositionParams(str, i, params, defDecoder) === void 0)
            return;
          break;
        }
      }
      const type = str.slice(0, i).toLowerCase();
      return { type, params };
    }
    function parseDispositionParams(str, i, params, defDecoder) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code === 61)
              break;
            return;
          }
        }
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        let charset;
        name = str.slice(nameStart, i);
        if (name.charCodeAt(name.length - 1) === 42) {
          const charsetStart = ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (CHARSET[code] !== 1) {
              if (code !== 39)
                return;
              break;
            }
          }
          if (i === str.length)
            return;
          charset = str.slice(charsetStart, i);
          ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 39)
              break;
          }
          if (i === str.length)
            return;
          ++i;
          if (i === str.length)
            return;
          valueStart = i;
          let encode = 0;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (EXTENDED_VALUE[code] !== 1) {
              if (code === 37) {
                let hexUpper;
                let hexLower;
                if (i + 2 < str.length && (hexUpper = HEX_VALUES[str.charCodeAt(i + 1)]) !== -1 && (hexLower = HEX_VALUES[str.charCodeAt(i + 2)]) !== -1) {
                  const byteVal = (hexUpper << 4) + hexLower;
                  value += str.slice(valueStart, i);
                  value += String.fromCharCode(byteVal);
                  i += 2;
                  valueStart = i + 1;
                  if (byteVal >= 128)
                    encode = 2;
                  else if (encode === 0)
                    encode = 1;
                  continue;
                }
                return;
              }
              break;
            }
          }
          value += str.slice(valueStart, i);
          value = convertToUTF8(value, charset, encode);
          if (value === void 0)
            return;
        } else {
          ++i;
          if (i === str.length)
            return;
          if (str.charCodeAt(i) === 34) {
            valueStart = ++i;
            let escaping = false;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (code === 92) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                } else {
                  value += str.slice(valueStart, i);
                  escaping = true;
                }
                continue;
              }
              if (code === 34) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                  continue;
                }
                value += str.slice(valueStart, i);
                break;
              }
              if (escaping) {
                valueStart = i - 1;
                escaping = false;
              }
              if (QDTEXT[code] !== 1)
                return;
            }
            if (i === str.length)
              return;
            ++i;
          } else {
            valueStart = i;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (TOKEN[code] !== 1) {
                if (i === valueStart)
                  return;
                break;
              }
            }
            value = str.slice(valueStart, i);
          }
          value = defDecoder(value, 2);
          if (value === void 0)
            return;
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    function getDecoder(charset) {
      let lc;
      while (true) {
        switch (charset) {
          case "utf-8":
          case "utf8":
            return decoders.utf8;
          case "latin1":
          case "ascii":
          // TODO: Make these a separate, strict decoder?
          case "us-ascii":
          case "iso-8859-1":
          case "iso8859-1":
          case "iso88591":
          case "iso_8859-1":
          case "windows-1252":
          case "iso_8859-1:1987":
          case "cp1252":
          case "x-cp1252":
            return decoders.latin1;
          case "utf16le":
          case "utf-16le":
          case "ucs2":
          case "ucs-2":
            return decoders.utf16le;
          case "base64":
            return decoders.base64;
          default:
            if (lc === void 0) {
              lc = true;
              charset = charset.toLowerCase();
              continue;
            }
            return decoders.other.bind(charset);
        }
      }
    }
    var decoders = {
      utf8: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string") {
          if (hint < 2)
            return data;
          data = Buffer.from(data, "latin1");
        }
        return data.utf8Slice(0, data.length);
      },
      latin1: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          return data;
        return data.latin1Slice(0, data.length);
      },
      utf16le: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.ucs2Slice(0, data.length);
      },
      base64: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.base64Slice(0, data.length);
      },
      other: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        try {
          const decoder = new TextDecoder(exports2);
          return decoder.decode(data);
        } catch {
        }
      }
    };
    function convertToUTF8(data, charset, hint) {
      const decode = getDecoder(charset);
      if (decode)
        return decode(data, hint);
    }
    function basename(path14) {
      if (typeof path14 !== "string")
        return "";
      for (let i = path14.length - 1; i >= 0; --i) {
        switch (path14.charCodeAt(i)) {
          case 47:
          // '/'
          case 92:
            path14 = path14.slice(i + 1);
            return path14 === ".." || path14 === "." ? "" : path14;
        }
      }
      return path14 === ".." || path14 === "." ? "" : path14;
    }
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var QDTEXT = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    var CHARSET = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var EXTENDED_VALUE = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    };
  }
});

// node_modules/streamsearch/lib/sbmh.js
var require_sbmh = __commonJS({
  "node_modules/streamsearch/lib/sbmh.js"(exports2, module2) {
    "use strict";
    function memcmp(buf1, pos1, buf2, pos2, num) {
      for (let i = 0; i < num; ++i) {
        if (buf1[pos1 + i] !== buf2[pos2 + i])
          return false;
      }
      return true;
    }
    var SBMH = class {
      constructor(needle, cb) {
        if (typeof cb !== "function")
          throw new Error("Missing match callback");
        if (typeof needle === "string")
          needle = Buffer.from(needle);
        else if (!Buffer.isBuffer(needle))
          throw new Error(`Expected Buffer for needle, got ${typeof needle}`);
        const needleLen = needle.length;
        this.maxMatches = Infinity;
        this.matches = 0;
        this._cb = cb;
        this._lookbehindSize = 0;
        this._needle = needle;
        this._bufPos = 0;
        this._lookbehind = Buffer.allocUnsafe(needleLen);
        this._occ = [
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen
        ];
        if (needleLen > 1) {
          for (let i = 0; i < needleLen - 1; ++i)
            this._occ[needle[i]] = needleLen - 1 - i;
        }
      }
      reset() {
        this.matches = 0;
        this._lookbehindSize = 0;
        this._bufPos = 0;
      }
      push(chunk, pos) {
        let result;
        if (!Buffer.isBuffer(chunk))
          chunk = Buffer.from(chunk, "latin1");
        const chunkLen = chunk.length;
        this._bufPos = pos || 0;
        while (result !== chunkLen && this.matches < this.maxMatches)
          result = feed(this, chunk);
        return result;
      }
      destroy() {
        const lbSize = this._lookbehindSize;
        if (lbSize)
          this._cb(false, this._lookbehind, 0, lbSize, false);
        this.reset();
      }
    };
    function feed(self, data) {
      const len = data.length;
      const needle = self._needle;
      const needleLen = needle.length;
      let pos = -self._lookbehindSize;
      const lastNeedleCharPos = needleLen - 1;
      const lastNeedleChar = needle[lastNeedleCharPos];
      const end = len - needleLen;
      const occ = self._occ;
      const lookbehind = self._lookbehind;
      if (pos < 0) {
        while (pos < 0 && pos <= end) {
          const nextPos = pos + lastNeedleCharPos;
          const ch = nextPos < 0 ? lookbehind[self._lookbehindSize + nextPos] : data[nextPos];
          if (ch === lastNeedleChar && matchNeedle(self, data, pos, lastNeedleCharPos)) {
            self._lookbehindSize = 0;
            ++self.matches;
            if (pos > -self._lookbehindSize)
              self._cb(true, lookbehind, 0, self._lookbehindSize + pos, false);
            else
              self._cb(true, void 0, 0, 0, true);
            return self._bufPos = pos + needleLen;
          }
          pos += occ[ch];
        }
        while (pos < 0 && !matchNeedle(self, data, pos, len - pos))
          ++pos;
        if (pos < 0) {
          const bytesToCutOff = self._lookbehindSize + pos;
          if (bytesToCutOff > 0) {
            self._cb(false, lookbehind, 0, bytesToCutOff, false);
          }
          self._lookbehindSize -= bytesToCutOff;
          lookbehind.copy(lookbehind, 0, bytesToCutOff, self._lookbehindSize);
          lookbehind.set(data, self._lookbehindSize);
          self._lookbehindSize += len;
          self._bufPos = len;
          return len;
        }
        self._cb(false, lookbehind, 0, self._lookbehindSize, false);
        self._lookbehindSize = 0;
      }
      pos += self._bufPos;
      const firstNeedleChar = needle[0];
      while (pos <= end) {
        const ch = data[pos + lastNeedleCharPos];
        if (ch === lastNeedleChar && data[pos] === firstNeedleChar && memcmp(needle, 0, data, pos, lastNeedleCharPos)) {
          ++self.matches;
          if (pos > 0)
            self._cb(true, data, self._bufPos, pos, true);
          else
            self._cb(true, void 0, 0, 0, true);
          return self._bufPos = pos + needleLen;
        }
        pos += occ[ch];
      }
      while (pos < len) {
        if (data[pos] !== firstNeedleChar || !memcmp(data, pos, needle, 0, len - pos)) {
          ++pos;
          continue;
        }
        data.copy(lookbehind, 0, pos, len);
        self._lookbehindSize = len - pos;
        break;
      }
      if (pos > 0)
        self._cb(false, data, self._bufPos, pos < len ? pos : len, true);
      self._bufPos = len;
      return len;
    }
    function matchNeedle(self, data, pos, len) {
      const lb = self._lookbehind;
      const lbSize = self._lookbehindSize;
      const needle = self._needle;
      for (let i = 0; i < len; ++i, ++pos) {
        const ch = pos < 0 ? lb[lbSize + pos] : data[pos];
        if (ch !== needle[i])
          return false;
      }
      return true;
    }
    module2.exports = SBMH;
  }
});

// node_modules/busboy/lib/types/multipart.js
var require_multipart = __commonJS({
  "node_modules/busboy/lib/types/multipart.js"(exports2, module2) {
    "use strict";
    var { Readable, Writable } = require("stream");
    var StreamSearch = require_sbmh();
    var {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    } = require_utils();
    var BUF_CRLF = Buffer.from("\r\n");
    var BUF_CR = Buffer.from("\r");
    var BUF_DASH = Buffer.from("-");
    function noop() {
    }
    var MAX_HEADER_PAIRS = 2e3;
    var MAX_HEADER_SIZE = 16 * 1024;
    var HPARSER_NAME = 0;
    var HPARSER_PRE_OWS = 1;
    var HPARSER_VALUE = 2;
    var HeaderParser = class {
      constructor(cb) {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
        this.cb = cb;
      }
      reset() {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
      }
      push(chunk, pos, end) {
        let start2 = pos;
        while (pos < end) {
          switch (this.state) {
            case HPARSER_NAME: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (TOKEN[code] !== 1) {
                  if (code !== 58)
                    return -1;
                  this.name += chunk.latin1Slice(start2, pos);
                  if (this.name.length === 0)
                    return -1;
                  ++pos;
                  done = true;
                  this.state = HPARSER_PRE_OWS;
                  break;
                }
              }
              if (!done) {
                this.name += chunk.latin1Slice(start2, pos);
                break;
              }
            }
            case HPARSER_PRE_OWS: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (code !== 32 && code !== 9) {
                  start2 = pos;
                  done = true;
                  this.state = HPARSER_VALUE;
                  break;
                }
              }
              if (!done)
                break;
            }
            case HPARSER_VALUE:
              switch (this.crlf) {
                case 0:
                  for (; pos < end; ++pos) {
                    if (this.byteCount === MAX_HEADER_SIZE)
                      return -1;
                    ++this.byteCount;
                    const code = chunk[pos];
                    if (FIELD_VCHAR[code] !== 1) {
                      if (code !== 13)
                        return -1;
                      ++this.crlf;
                      break;
                    }
                  }
                  this.value += chunk.latin1Slice(start2, pos++);
                  break;
                case 1:
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  ++this.crlf;
                  break;
                case 2: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  const code = chunk[pos];
                  if (code === 32 || code === 9) {
                    start2 = pos;
                    this.crlf = 0;
                  } else {
                    if (++this.pairCount < MAX_HEADER_PAIRS) {
                      this.name = this.name.toLowerCase();
                      if (this.header[this.name] === void 0)
                        this.header[this.name] = [this.value];
                      else
                        this.header[this.name].push(this.value);
                    }
                    if (code === 13) {
                      ++this.crlf;
                      ++pos;
                    } else {
                      start2 = pos;
                      this.crlf = 0;
                      this.state = HPARSER_NAME;
                      this.name = "";
                      this.value = "";
                    }
                  }
                  break;
                }
                case 3: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  const header = this.header;
                  this.reset();
                  this.cb(header);
                  return pos;
                }
              }
              break;
          }
        }
        return pos;
      }
    };
    var FileStream = class extends Readable {
      constructor(opts, owner) {
        super(opts);
        this.truncated = false;
        this._readcb = null;
        this.once("end", () => {
          this._read();
          if (--owner._fileEndsLeft === 0 && owner._finalcb) {
            const cb = owner._finalcb;
            owner._finalcb = null;
            process.nextTick(cb);
          }
        });
      }
      _read(n) {
        const cb = this._readcb;
        if (cb) {
          this._readcb = null;
          cb();
        }
      }
    };
    var ignoreData = {
      push: (chunk, pos) => {
      },
      destroy: () => {
      }
    };
    function callAndUnsetCb(self, err) {
      const cb = self._writecb;
      self._writecb = null;
      if (err)
        self.destroy(err);
      else if (cb)
        cb();
    }
    function nullDecoder(val, hint) {
      return val;
    }
    var Multipart = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        if (!cfg.conType.params || typeof cfg.conType.params.boundary !== "string")
          throw new Error("Multipart: Boundary not found");
        const boundary = cfg.conType.params.boundary;
        const paramDecoder = typeof cfg.defParamCharset === "string" && cfg.defParamCharset ? getDecoder(cfg.defParamCharset) : nullDecoder;
        const defCharset = cfg.defCharset || "utf8";
        const preservePath = cfg.preservePath;
        const fileOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.fileHwm === "number" ? cfg.fileHwm : void 0
        };
        const limits = cfg.limits;
        const fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        const fileSizeLimit = limits && typeof limits.fileSize === "number" ? limits.fileSize : Infinity;
        const filesLimit = limits && typeof limits.files === "number" ? limits.files : Infinity;
        const fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        const partsLimit = limits && typeof limits.parts === "number" ? limits.parts : Infinity;
        let parts = -1;
        let fields = 0;
        let files = 0;
        let skipPart = false;
        this._fileEndsLeft = 0;
        this._fileStream = void 0;
        this._complete = false;
        let fileSize = 0;
        let field;
        let fieldSize = 0;
        let partCharset;
        let partEncoding;
        let partType;
        let partName;
        let partTruncated = false;
        let hitFilesLimit = false;
        let hitFieldsLimit = false;
        this._hparser = null;
        const hparser = new HeaderParser((header) => {
          this._hparser = null;
          skipPart = false;
          partType = "text/plain";
          partCharset = defCharset;
          partEncoding = "7bit";
          partName = void 0;
          partTruncated = false;
          let filename;
          if (!header["content-disposition"]) {
            skipPart = true;
            return;
          }
          const disp = parseDisposition(
            header["content-disposition"][0],
            paramDecoder
          );
          if (!disp || disp.type !== "form-data") {
            skipPart = true;
            return;
          }
          if (disp.params) {
            if (disp.params.name)
              partName = disp.params.name;
            if (disp.params["filename*"])
              filename = disp.params["filename*"];
            else if (disp.params.filename)
              filename = disp.params.filename;
            if (filename !== void 0 && !preservePath)
              filename = basename(filename);
          }
          if (header["content-type"]) {
            const conType = parseContentType(header["content-type"][0]);
            if (conType) {
              partType = `${conType.type}/${conType.subtype}`;
              if (conType.params && typeof conType.params.charset === "string")
                partCharset = conType.params.charset.toLowerCase();
            }
          }
          if (header["content-transfer-encoding"])
            partEncoding = header["content-transfer-encoding"][0].toLowerCase();
          if (partType === "application/octet-stream" || filename !== void 0) {
            if (files === filesLimit) {
              if (!hitFilesLimit) {
                hitFilesLimit = true;
                this.emit("filesLimit");
              }
              skipPart = true;
              return;
            }
            ++files;
            if (this.listenerCount("file") === 0) {
              skipPart = true;
              return;
            }
            fileSize = 0;
            this._fileStream = new FileStream(fileOpts, this);
            ++this._fileEndsLeft;
            this.emit(
              "file",
              partName,
              this._fileStream,
              {
                filename,
                encoding: partEncoding,
                mimeType: partType
              }
            );
          } else {
            if (fields === fieldsLimit) {
              if (!hitFieldsLimit) {
                hitFieldsLimit = true;
                this.emit("fieldsLimit");
              }
              skipPart = true;
              return;
            }
            ++fields;
            if (this.listenerCount("field") === 0) {
              skipPart = true;
              return;
            }
            field = [];
            fieldSize = 0;
          }
        });
        let matchPostBoundary = 0;
        const ssCb = (isMatch, data, start2, end, isDataSafe) => {
          retrydata:
            while (data) {
              if (this._hparser !== null) {
                const ret = this._hparser.push(data, start2, end);
                if (ret === -1) {
                  this._hparser = null;
                  hparser.reset();
                  this.emit("error", new Error("Malformed part header"));
                  break;
                }
                start2 = ret;
              }
              if (start2 === end)
                break;
              if (matchPostBoundary !== 0) {
                if (matchPostBoundary === 1) {
                  switch (data[start2]) {
                    case 45:
                      matchPostBoundary = 2;
                      ++start2;
                      break;
                    case 13:
                      matchPostBoundary = 3;
                      ++start2;
                      break;
                    default:
                      matchPostBoundary = 0;
                  }
                  if (start2 === end)
                    return;
                }
                if (matchPostBoundary === 2) {
                  matchPostBoundary = 0;
                  if (data[start2] === 45) {
                    this._complete = true;
                    this._bparser = ignoreData;
                    return;
                  }
                  const writecb = this._writecb;
                  this._writecb = noop;
                  ssCb(false, BUF_DASH, 0, 1, false);
                  this._writecb = writecb;
                } else if (matchPostBoundary === 3) {
                  matchPostBoundary = 0;
                  if (data[start2] === 10) {
                    ++start2;
                    if (parts >= partsLimit)
                      break;
                    this._hparser = hparser;
                    if (start2 === end)
                      break;
                    continue retrydata;
                  } else {
                    const writecb = this._writecb;
                    this._writecb = noop;
                    ssCb(false, BUF_CR, 0, 1, false);
                    this._writecb = writecb;
                  }
                }
              }
              if (!skipPart) {
                if (this._fileStream) {
                  let chunk;
                  const actualLen = Math.min(end - start2, fileSizeLimit - fileSize);
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start2, start2 + actualLen);
                  } else {
                    chunk = data.slice(start2, start2 + actualLen);
                  }
                  fileSize += chunk.length;
                  if (fileSize === fileSizeLimit) {
                    if (chunk.length > 0)
                      this._fileStream.push(chunk);
                    this._fileStream.emit("limit");
                    this._fileStream.truncated = true;
                    skipPart = true;
                  } else if (!this._fileStream.push(chunk)) {
                    if (this._writecb)
                      this._fileStream._readcb = this._writecb;
                    this._writecb = null;
                  }
                } else if (field !== void 0) {
                  let chunk;
                  const actualLen = Math.min(
                    end - start2,
                    fieldSizeLimit - fieldSize
                  );
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start2, start2 + actualLen);
                  } else {
                    chunk = data.slice(start2, start2 + actualLen);
                  }
                  fieldSize += actualLen;
                  field.push(chunk);
                  if (fieldSize === fieldSizeLimit) {
                    skipPart = true;
                    partTruncated = true;
                  }
                }
              }
              break;
            }
          if (isMatch) {
            matchPostBoundary = 1;
            if (this._fileStream) {
              this._fileStream.push(null);
              this._fileStream = null;
            } else if (field !== void 0) {
              let data2;
              switch (field.length) {
                case 0:
                  data2 = "";
                  break;
                case 1:
                  data2 = convertToUTF8(field[0], partCharset, 0);
                  break;
                default:
                  data2 = convertToUTF8(
                    Buffer.concat(field, fieldSize),
                    partCharset,
                    0
                  );
              }
              field = void 0;
              fieldSize = 0;
              this.emit(
                "field",
                partName,
                data2,
                {
                  nameTruncated: false,
                  valueTruncated: partTruncated,
                  encoding: partEncoding,
                  mimeType: partType
                }
              );
            }
            if (++parts === partsLimit)
              this.emit("partsLimit");
          }
        };
        this._bparser = new StreamSearch(`\r
--${boundary}`, ssCb);
        this._writecb = null;
        this._finalcb = null;
        this.write(BUF_CRLF);
      }
      static detect(conType) {
        return conType.type === "multipart" && conType.subtype === "form-data";
      }
      _write(chunk, enc, cb) {
        this._writecb = cb;
        this._bparser.push(chunk, 0);
        if (this._writecb)
          callAndUnsetCb(this);
      }
      _destroy(err, cb) {
        this._hparser = null;
        this._bparser = ignoreData;
        if (!err)
          err = checkEndState(this);
        const fileStream = this._fileStream;
        if (fileStream) {
          this._fileStream = null;
          fileStream.destroy(err);
        }
        cb(err);
      }
      _final(cb) {
        this._bparser.destroy();
        if (!this._complete)
          return cb(new Error("Unexpected end of form"));
        if (this._fileEndsLeft)
          this._finalcb = finalcb.bind(null, this, cb);
        else
          finalcb(this, cb);
      }
    };
    function finalcb(self, cb, err) {
      if (err)
        return cb(err);
      err = checkEndState(self);
      cb(err);
    }
    function checkEndState(self) {
      if (self._hparser)
        return new Error("Malformed part header");
      const fileStream = self._fileStream;
      if (fileStream) {
        self._fileStream = null;
        fileStream.destroy(new Error("Unexpected end of file"));
      }
      if (!self._complete)
        return new Error("Unexpected end of form");
    }
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var FIELD_VCHAR = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    module2.exports = Multipart;
  }
});

// node_modules/busboy/lib/types/urlencoded.js
var require_urlencoded = __commonJS({
  "node_modules/busboy/lib/types/urlencoded.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var { getDecoder } = require_utils();
    var URLEncoded = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        let charset = cfg.defCharset || "utf8";
        if (cfg.conType.params && typeof cfg.conType.params.charset === "string")
          charset = cfg.conType.params.charset;
        this.charset = charset;
        const limits = cfg.limits;
        this.fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        this.fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        this.fieldNameSizeLimit = limits && typeof limits.fieldNameSize === "number" ? limits.fieldNameSize : 100;
        this._inKey = true;
        this._keyTrunc = false;
        this._valTrunc = false;
        this._bytesKey = 0;
        this._bytesVal = 0;
        this._fields = 0;
        this._key = "";
        this._val = "";
        this._byte = -2;
        this._lastPos = 0;
        this._encode = 0;
        this._decoder = getDecoder(charset);
      }
      static detect(conType) {
        return conType.type === "application" && conType.subtype === "x-www-form-urlencoded";
      }
      _write(chunk, enc, cb) {
        if (this._fields >= this.fieldsLimit)
          return cb();
        let i = 0;
        const len = chunk.length;
        this._lastPos = 0;
        if (this._byte !== -2) {
          i = readPctEnc(this, chunk, i, len);
          if (i === -1)
            return cb(new Error("Malformed urlencoded form"));
          if (i >= len)
            return cb();
          if (this._inKey)
            ++this._bytesKey;
          else
            ++this._bytesVal;
        }
        main:
          while (i < len) {
            if (this._inKey) {
              i = skipKeyBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 61:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    this._inKey = false;
                    continue main;
                  case 38:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0) {
                      this.emit(
                        "field",
                        this._key,
                        "",
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: false,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue;
                  case 43:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._key += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesKey;
                    i = skipKeyBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesKey;
                i = skipKeyBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._key += chunk.latin1Slice(this._lastPos, i);
            } else {
              i = skipValBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 38:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._inKey = true;
                    this._val = this._decoder(this._val, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0 || this._bytesVal > 0) {
                      this.emit(
                        "field",
                        this._key,
                        this._val,
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: this._valTrunc,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue main;
                  case 43:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._val += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesVal;
                    i = skipValBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesVal;
                i = skipValBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._val += chunk.latin1Slice(this._lastPos, i);
            }
          }
        cb();
      }
      _final(cb) {
        if (this._byte !== -2)
          return cb(new Error("Malformed urlencoded form"));
        if (!this._inKey || this._bytesKey > 0 || this._bytesVal > 0) {
          if (this._inKey)
            this._key = this._decoder(this._key, this._encode);
          else
            this._val = this._decoder(this._val, this._encode);
          this.emit(
            "field",
            this._key,
            this._val,
            {
              nameTruncated: this._keyTrunc,
              valueTruncated: this._valTrunc,
              encoding: this.charset,
              mimeType: "text/plain"
            }
          );
        }
        cb();
      }
    };
    function readPctEnc(self, chunk, pos, len) {
      if (pos >= len)
        return len;
      if (self._byte === -1) {
        const hexUpper = HEX_VALUES[chunk[pos++]];
        if (hexUpper === -1)
          return -1;
        if (hexUpper >= 8)
          self._encode = 2;
        if (pos < len) {
          const hexLower = HEX_VALUES[chunk[pos++]];
          if (hexLower === -1)
            return -1;
          if (self._inKey)
            self._key += String.fromCharCode((hexUpper << 4) + hexLower);
          else
            self._val += String.fromCharCode((hexUpper << 4) + hexLower);
          self._byte = -2;
          self._lastPos = pos;
        } else {
          self._byte = hexUpper;
        }
      } else {
        const hexLower = HEX_VALUES[chunk[pos++]];
        if (hexLower === -1)
          return -1;
        if (self._inKey)
          self._key += String.fromCharCode((self._byte << 4) + hexLower);
        else
          self._val += String.fromCharCode((self._byte << 4) + hexLower);
        self._byte = -2;
        self._lastPos = pos;
      }
      return pos;
    }
    function skipKeyBytes(self, chunk, pos, len) {
      if (self._bytesKey > self.fieldNameSizeLimit) {
        if (!self._keyTrunc) {
          if (self._lastPos < pos)
            self._key += chunk.latin1Slice(self._lastPos, pos - 1);
        }
        self._keyTrunc = true;
        for (; pos < len; ++pos) {
          const code = chunk[pos];
          if (code === 61 || code === 38)
            break;
          ++self._bytesKey;
        }
        self._lastPos = pos;
      }
      return pos;
    }
    function skipValBytes(self, chunk, pos, len) {
      if (self._bytesVal > self.fieldSizeLimit) {
        if (!self._valTrunc) {
          if (self._lastPos < pos)
            self._val += chunk.latin1Slice(self._lastPos, pos - 1);
        }
        self._valTrunc = true;
        for (; pos < len; ++pos) {
          if (chunk[pos] === 38)
            break;
          ++self._bytesVal;
        }
        self._lastPos = pos;
      }
      return pos;
    }
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = URLEncoded;
  }
});

// node_modules/busboy/lib/index.js
var require_lib = __commonJS({
  "node_modules/busboy/lib/index.js"(exports2, module2) {
    "use strict";
    var { parseContentType } = require_utils();
    function getInstance(cfg) {
      const headers = cfg.headers;
      const conType = parseContentType(headers["content-type"]);
      if (!conType)
        throw new Error("Malformed content type");
      for (const type of TYPES) {
        const matched = type.detect(conType);
        if (!matched)
          continue;
        const instanceCfg = {
          limits: cfg.limits,
          headers,
          conType,
          highWaterMark: void 0,
          fileHwm: void 0,
          defCharset: void 0,
          defParamCharset: void 0,
          preservePath: false
        };
        if (cfg.highWaterMark)
          instanceCfg.highWaterMark = cfg.highWaterMark;
        if (cfg.fileHwm)
          instanceCfg.fileHwm = cfg.fileHwm;
        instanceCfg.defCharset = cfg.defCharset;
        instanceCfg.defParamCharset = cfg.defParamCharset;
        instanceCfg.preservePath = cfg.preservePath;
        return new type(instanceCfg);
      }
      throw new Error(`Unsupported content type: ${headers["content-type"]}`);
    }
    var TYPES = [
      require_multipart(),
      require_urlencoded()
    ].filter(function(typemod) {
      return typeof typemod.detect === "function";
    });
    module2.exports = (cfg) => {
      if (typeof cfg !== "object" || cfg === null)
        cfg = {};
      if (typeof cfg.headers !== "object" || cfg.headers === null || typeof cfg.headers["content-type"] !== "string") {
        throw new Error("Missing Content-Type");
      }
      return getInstance(cfg);
    };
  }
});

// src/printHubServer/serverMain.ts
var import_electron = require("electron");
var import_node_child_process2 = require("node:child_process");
var import_node_fs14 = __toESM(require("node:fs"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path13 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");

// src/core/printHub/atomicIo.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);

// src/types/printHub.ts
var JOB_SCHEMA_VERSION = 1;
var STATE_FOLDERS = {
  incoming: "Incoming",
  validating: "Validating",
  waiting_approval: "WaitingApproval",
  printing: "Printing",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
  rejected: "Rejected",
  archived: "Archive"
};

// src/core/printHub/jobPackage.ts
var JOB_MANIFEST_NAME = "job.json";
function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}
var InvalidManifestError = class extends Error {
  constructor(message) {
    super(`Invalid job.json: ${message}`);
    this.name = "InvalidManifestError";
  }
};
function parseManifest(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new InvalidManifestError("not valid JSON");
  }
  return validateManifest(raw);
}
function validateManifest(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidManifestError("not an object");
  }
  const m = raw;
  if (typeof m.jobSchemaVersion !== "number") {
    throw new InvalidManifestError("missing jobSchemaVersion");
  }
  if (m.jobSchemaVersion > JOB_SCHEMA_VERSION) {
    throw new InvalidManifestError(`unsupported jobSchemaVersion ${m.jobSchemaVersion}`);
  }
  if (typeof m.jobId !== "string" || m.jobId.length === 0) {
    throw new InvalidManifestError("missing jobId");
  }
  if (!Array.isArray(m.files) || m.files.length === 0) {
    throw new InvalidManifestError("files must be a non-empty array");
  }
  for (const f of m.files) {
    if (typeof f !== "object" || f === null || typeof f.path !== "string") {
      throw new InvalidManifestError("each file needs a path");
    }
  }
  const out = raw;
  if (typeof out.requestedOutput?.size !== "string") {
    throw new InvalidManifestError("missing requestedOutput.size");
  }
  return out;
}

// src/core/printHub/atomicIo.ts
var READY_SENTINEL = "READY";
var STAGING_FOLDER = ".staging";
function hubStateDir(hubRoot, state2) {
  return import_node_path.default.join(hubRoot, STATE_FOLDERS[state2]);
}
function jobDir(hubRoot, state2, jobId) {
  return import_node_path.default.join(hubStateDir(hubRoot, state2), jobId);
}
function ensureHubLayout(hubRoot) {
  for (const state2 of Object.keys(STATE_FOLDERS)) {
    import_node_fs.default.mkdirSync(hubStateDir(hubRoot, state2), { recursive: true });
  }
  import_node_fs.default.mkdirSync(import_node_path.default.join(hubStateDir(hubRoot, "incoming"), STAGING_FOLDER), { recursive: true });
  import_node_fs.default.mkdirSync(import_node_path.default.join(hubRoot, "config"), { recursive: true });
}
function stagingDir(hubRoot, jobId) {
  return import_node_path.default.join(hubStateDir(hubRoot, "incoming"), STAGING_FOLDER, jobId);
}
function beginJobStaging(hubRoot, jobId) {
  const dir = stagingDir(hubRoot, jobId);
  import_node_fs.default.rmSync(dir, { recursive: true, force: true });
  import_node_fs.default.mkdirSync(import_node_path.default.join(dir, "images"), { recursive: true });
  import_node_fs.default.mkdirSync(import_node_path.default.join(dir, "previews"), { recursive: true });
  return dir;
}
function finalizeJob(hubRoot, jobId) {
  const staging = stagingDir(hubRoot, jobId);
  if (!import_node_fs.default.existsSync(staging)) {
    throw new Error(`No staged job to finalize: ${jobId}`);
  }
  import_node_fs.default.writeFileSync(import_node_path.default.join(staging, READY_SENTINEL), "");
  const dest = jobDir(hubRoot, "incoming", jobId);
  import_node_fs.default.rmSync(dest, { recursive: true, force: true });
  import_node_fs.default.renameSync(staging, dest);
  return dest;
}
function isJobReady(jobFolder) {
  return import_node_fs.default.existsSync(import_node_path.default.join(jobFolder, READY_SENTINEL));
}
function listReadyJobIds(hubRoot) {
  const incoming = hubStateDir(hubRoot, "incoming");
  if (!import_node_fs.default.existsSync(incoming)) {
    return [];
  }
  return import_node_fs.default.readdirSync(incoming, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).filter((id) => isJobReady(import_node_path.default.join(incoming, id)));
}
function transitionJobFolder(hubRoot, jobId, from, to) {
  const src = jobDir(hubRoot, from, jobId);
  const dest = jobDir(hubRoot, to, jobId);
  if (!import_node_fs.default.existsSync(src)) {
    throw new Error(`Job ${jobId} not found in ${from}`);
  }
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(dest), { recursive: true });
  import_node_fs.default.rmSync(dest, { recursive: true, force: true });
  import_node_fs.default.renameSync(src, dest);
  return dest;
}
function writeManifest(jobFolder, manifest) {
  const tmp = import_node_path.default.join(jobFolder, `${JOB_MANIFEST_NAME}.tmp`);
  import_node_fs.default.writeFileSync(tmp, serializeManifest(manifest));
  import_node_fs.default.renameSync(tmp, import_node_path.default.join(jobFolder, JOB_MANIFEST_NAME));
}
function readManifest(jobFolder) {
  const json = import_node_fs.default.readFileSync(import_node_path.default.join(jobFolder, JOB_MANIFEST_NAME), "utf-8");
  return parseManifest(json);
}

// src/core/printHub/adapters/spoolerAdapter.ts
var MICRONS_PER_MM = 1e3;
function createSpoolerAdapter(printImage) {
  return {
    id: "windows_spooler",
    supports: (request) => request.windowsPrinterName.length > 0,
    async print(request, onProgress) {
      const printed = [];
      const totalImages = request.images.length;
      const bleed = Math.max(0, request.preset.bleedMm);
      const options = {
        pageWidthMicrons: Math.round((request.preset.widthMm + 2 * bleed) * MICRONS_PER_MM),
        pageHeightMicrons: Math.round((request.preset.heightMm + 2 * bleed) * MICRONS_PER_MM),
        borderless: request.preset.borderMode === "borderless"
      };
      try {
        for (let i = 0; i < request.images.length; i += 1) {
          const img = request.images[i];
          const pageOptions = {
            ...options,
            pageWidthMicrons: img.pageWidthMicrons ?? options.pageWidthMicrons,
            pageHeightMicrons: img.pageHeightMicrons ?? options.pageHeightMicrons
          };
          for (let copy = 0; copy < Math.max(1, img.copies); copy += 1) {
            await printImage(img.filePath, { printerName: request.windowsPrinterName, ...pageOptions });
          }
          printed.push(img.filePath);
          onProgress?.({ printedImages: i + 1, totalImages });
        }
        return { success: true, printedFiles: printed };
      } catch (err) {
        return { success: false, printedFiles: printed, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
}

// src/core/printHub/printerProfiles.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);

// src/core/printHub/sizes.ts
var SIZE_MM = {
  // Photo sizes (cm)
  "9x13": { widthMm: 89, heightMm: 127 },
  "10x15": { widthMm: 102, heightMm: 152 },
  "13x18": { widthMm: 127, heightMm: 178 },
  "15x20": { widthMm: 152, heightMm: 203 },
  "15x21": { widthMm: 152, heightMm: 210 },
  "20x25": { widthMm: 203, heightMm: 254 },
  "20x30": { widthMm: 203, heightMm: 305 },
  "28x36": { widthMm: 279, heightMm: 356 },
  "30x45": { widthMm: 305, heightMm: 457 },
  // Paper sizes (ISO / US)
  A6: { widthMm: 105, heightMm: 148 },
  A5: { widthMm: 148, heightMm: 210 },
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 }
};
var SIZE_KEYS = Object.keys(SIZE_MM);

// src/core/printHub/defaultProfiles.ts
function makePreset(id, name, size, finish, borderMode) {
  const dims = SIZE_MM[size] ?? SIZE_MM["10x15"];
  return {
    id,
    name,
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    dpi: 300,
    bleedMm: borderMode === "borderless" ? 1.5 : 0,
    finish,
    borderMode,
    copies: 1
  };
}
var DEFAULT_PROFILES = [
  {
    deviceId: "dnp_ds_rx1hs",
    windowsPrinterName: "DNP DS-RX1HS",
    displayName: "DNP DS-RX1HS",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy", "matte"],
    presets: [
      makePreset("dnp_rx1hs_10x15_glossy", "10\xD715 \u05DE\u05D1\u05E8\u05D9\u05E7 \u05DC\u05DC\u05D0 \u05E9\u05D5\u05DC\u05D9\u05D9\u05DD", "10x15", "glossy", "borderless"),
      makePreset("dnp_rx1hs_10x15_matte", "10\xD715 \u05DE\u05D0\u05D8 \u05DC\u05DC\u05D0 \u05E9\u05D5\u05DC\u05D9\u05D9\u05DD", "10x15", "matte", "borderless"),
      makePreset("dnp_rx1hs_15x20_glossy", "15\xD720 \u05DE\u05D1\u05E8\u05D9\u05E7", "15x20", "glossy", "borderless")
    ]
  },
  {
    deviceId: "dnp_ds620a",
    windowsPrinterName: "DNP DS620",
    displayName: "DNP DS620A",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy", "matte"],
    presets: [
      makePreset("dnp_ds620_10x15_glossy", "10\xD715 \u05DE\u05D1\u05E8\u05D9\u05E7 \u05DC\u05DC\u05D0 \u05E9\u05D5\u05DC\u05D9\u05D9\u05DD", "10x15", "glossy", "borderless"),
      makePreset("dnp_ds620_15x20_glossy", "15\xD720 \u05DE\u05D1\u05E8\u05D9\u05E7", "15x20", "glossy", "borderless")
    ]
  },
  {
    deviceId: "mitsubishi_cpd80",
    windowsPrinterName: "Mitsubishi CP-D80",
    displayName: "Mitsubishi CP-D80",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy"],
    presets: [makePreset("mitsubishi_d80_10x15_glossy", "10\xD715 \u05DE\u05D1\u05E8\u05D9\u05E7", "10x15", "glossy", "borderless")]
  }
];

// src/core/printHub/resolveProfile.ts
function sizeKey(p) {
  for (const [key, dims] of Object.entries(SIZE_MM)) {
    if (Math.abs(dims.widthMm - p.widthMm) <= 2 && Math.abs(dims.heightMm - p.heightMm) <= 2) {
      return key;
    }
  }
  return `${Math.round(p.widthMm / 10)}x${Math.round(p.heightMm / 10)}`;
}
function resolvePreset(profiles, query) {
  const ordered = query.preferredDeviceId ? [...profiles].sort((a, b) => a.deviceId === query.preferredDeviceId ? -1 : b.deviceId === query.preferredDeviceId ? 1 : 0) : profiles;
  for (const profile of ordered) {
    const match = profile.presets.find(
      (p) => sizeKey(p) === query.size && p.finish === query.finish && p.borderMode === query.borderMode
    );
    if (match) return { profile, preset: match };
  }
  for (const profile of ordered) {
    const match = profile.presets.find((p) => sizeKey(p) === query.size && p.finish === query.finish);
    if (match) return { profile, preset: match };
  }
  return null;
}
function resolveTargetFromProfiles(profiles, manifest) {
  return resolvePreset(profiles, { ...manifest.requestedOutput, preferredDeviceId: manifest.routing.preferredDeviceId });
}

// src/core/printHub/printerProfiles.ts
function profilesConfigPath(hubRoot) {
  return import_node_path2.default.join(hubRoot, "config", "printers.json");
}
function loadProfiles(hubRoot) {
  const file = profilesConfigPath(hubRoot);
  if (!import_node_fs2.default.existsSync(file)) {
    return DEFAULT_PROFILES;
  }
  try {
    const parsed = JSON.parse(import_node_fs2.default.readFileSync(file, "utf-8"));
    return Array.isArray(parsed.profiles) && parsed.profiles.length > 0 ? parsed.profiles : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}
function saveProfiles(hubRoot, profiles) {
  import_node_fs2.default.mkdirSync(import_node_path2.default.join(hubRoot, "config"), { recursive: true });
  import_node_fs2.default.writeFileSync(profilesConfigPath(hubRoot), JSON.stringify({ profiles }, null, 2), "utf-8");
}

// src/core/printHub/stations.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
function stationsConfigPath(hubRoot) {
  return import_node_path3.default.join(hubRoot, "config", "stations.json");
}
function loadStations(hubRoot) {
  const file = stationsConfigPath(hubRoot);
  if (!import_node_fs3.default.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(import_node_fs3.default.readFileSync(file, "utf-8"));
    return Array.isArray(parsed.stations) ? parsed.stations : [];
  } catch {
    return [];
  }
}
function saveStations(hubRoot, stations) {
  import_node_fs3.default.mkdirSync(import_node_path3.default.join(hubRoot, "config"), { recursive: true });
  import_node_fs3.default.writeFileSync(stationsConfigPath(hubRoot), JSON.stringify({ stations }, null, 2), "utf-8");
}
function findStation(stations, computerName) {
  const name = computerName.trim().toLowerCase();
  return stations.find((s) => s.computerName.trim().toLowerCase() === name);
}
function requiresApprovalForJob(stations, manifest) {
  if (manifest.approval.state === "approved") return false;
  const station = findStation(stations, manifest.sourceComputer);
  const trusted = station?.trusted === true || station?.role === "admin";
  if (trusted) {
    return manifest.approval.mode === "require_approval";
  }
  return true;
}

// src/core/printHub/idempotency.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var CHECKED_STATES = [STATE_FOLDERS.done, STATE_FOLDERS.archived];
function printedFingerprints(hubRoot) {
  const out = /* @__PURE__ */ new Set();
  for (const folder of CHECKED_STATES) {
    const dir = import_node_path4.default.join(hubRoot, folder);
    if (!import_node_fs4.default.existsSync(dir)) continue;
    for (const entry of import_node_fs4.default.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const m = JSON.parse(import_node_fs4.default.readFileSync(import_node_path4.default.join(dir, entry.name, "job.json"), "utf-8"));
        if (typeof m.jobFingerprint === "string" && m.jobFingerprint.length > 0) out.add(m.jobFingerprint);
      } catch {
      }
    }
  }
  return out;
}
function isDuplicateFingerprint(hubRoot, fingerprint) {
  if (!fingerprint) return false;
  return printedFingerprints(hubRoot).has(fingerprint);
}

// src/core/printHub/productionLog.ts
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
function jobPrintCount(manifest) {
  const perPass = manifest.files.reduce((sum, f) => sum + Math.max(1, f.copies), 0);
  return perPass * Math.max(1, manifest.requestedOutput.copies);
}
function logFile(hubRoot, date) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return import_node_path5.default.join(hubRoot, "logs", `production_${stamp}.jsonl`);
}
function appendProductionLog(hubRoot, manifest, now = /* @__PURE__ */ new Date()) {
  const entry = {
    at: now.toISOString(),
    jobId: manifest.jobId,
    sourceComputer: manifest.sourceComputer,
    size: manifest.requestedOutput.size,
    finish: manifest.requestedOutput.finish,
    borderMode: manifest.requestedOutput.borderMode,
    prints: jobPrintCount(manifest)
  };
  const file = logFile(hubRoot, now);
  import_node_fs5.default.mkdirSync(import_node_path5.default.dirname(file), { recursive: true });
  import_node_fs5.default.appendFileSync(file, `${JSON.stringify(entry)}
`, "utf-8");
}
function readProductionLog(hubRoot, date = /* @__PURE__ */ new Date()) {
  const file = logFile(hubRoot, date);
  if (!import_node_fs5.default.existsSync(file)) return [];
  return import_node_fs5.default.readFileSync(file, "utf-8").split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// src/core/printHub/retention.ts
var import_node_fs6 = __toESM(require("node:fs"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var PURGEABLE = [STATE_FOLDERS.done, STATE_FOLDERS.failed, STATE_FOLDERS.canceled, STATE_FOLDERS.rejected, STATE_FOLDERS.archived];
function jobAgeDays(jobFolder, now) {
  let created = now;
  try {
    const m = JSON.parse(import_node_fs6.default.readFileSync(import_node_path6.default.join(jobFolder, "job.json"), "utf-8"));
    const t = m.createdAt ? Date.parse(m.createdAt) : NaN;
    created = Number.isNaN(t) ? import_node_fs6.default.statSync(jobFolder).mtimeMs : t;
  } catch {
    try {
      created = import_node_fs6.default.statSync(jobFolder).mtimeMs;
    } catch {
      return 0;
    }
  }
  return (now - created) / (1e3 * 60 * 60 * 24);
}
function purgeOldJobs(hubRoot, retentionDays, now = Date.now()) {
  if (retentionDays <= 0) return 0;
  let purged = 0;
  for (const folder of PURGEABLE) {
    const dir = import_node_path6.default.join(hubRoot, folder);
    if (!import_node_fs6.default.existsSync(dir)) continue;
    for (const entry of import_node_fs6.default.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const jobFolder = import_node_path6.default.join(dir, entry.name);
      if (jobAgeDays(jobFolder, now) >= retentionDays) {
        import_node_fs6.default.rmSync(jobFolder, { recursive: true, force: true });
        purged += 1;
      }
    }
  }
  return purged;
}

// src/core/printHub/mediaInventory.ts
var import_node_fs7 = __toESM(require("node:fs"), 1);
var import_node_path7 = __toESM(require("node:path"), 1);
function mediaConfigPath(hubRoot) {
  return import_node_path7.default.join(hubRoot, "config", "media.json");
}
function loadMedia(hubRoot) {
  const file = mediaConfigPath(hubRoot);
  if (!import_node_fs7.default.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(import_node_fs7.default.readFileSync(file, "utf-8"));
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}
function saveMedia(hubRoot, items) {
  import_node_fs7.default.mkdirSync(import_node_path7.default.join(hubRoot, "config"), { recursive: true });
  import_node_fs7.default.writeFileSync(mediaConfigPath(hubRoot), JSON.stringify({ items }, null, 2), "utf-8");
}
function consumeMedia(hubRoot, presetId, units) {
  const items = loadMedia(hubRoot);
  const entry = items.find((m) => m.presetId === presetId);
  if (entry === void 0) return;
  entry.remainingUnits = Math.max(0, entry.remainingUnits - Math.max(0, units));
  saveMedia(hubRoot, items);
}

// src/core/printHub/queueAdmin.ts
var import_node_fs8 = __toESM(require("node:fs"), 1);
var import_node_path8 = __toESM(require("node:path"), 1);
function readSummary(jobFolder, state2) {
  try {
    const m = JSON.parse(import_node_fs8.default.readFileSync(import_node_path8.default.join(jobFolder, "job.json"), "utf-8"));
    const history = Array.isArray(m.statusHistory) ? m.statusHistory : [];
    const last = history[history.length - 1] ?? {};
    return {
      jobId: m.jobId,
      state: state2,
      size: m.requestedOutput?.size,
      finish: m.requestedOutput?.finish,
      borderMode: m.requestedOutput?.borderMode,
      copies: m.requestedOutput?.copies,
      fileCount: Array.isArray(m.files) ? m.files.length : 0,
      customer: m.customer ?? { name: "", phone: "", note: "" },
      createdAt: m.createdAt,
      priority: m.routing?.priority,
      approval: m.approval ?? { mode: "auto", state: null },
      source: m.source,
      sourceComputer: m.sourceComputer,
      lastNote: last.note ?? ""
    };
  } catch {
    return { jobId: import_node_path8.default.basename(jobFolder), state: state2, fileCount: 0, error: "unreadable", customer: { name: "", phone: "", note: "" } };
  }
}
function listQueue(hubRoot) {
  const out = [];
  for (const stateKey of Object.keys(STATE_FOLDERS)) {
    const dir = import_node_path8.default.join(hubRoot, STATE_FOLDERS[stateKey]);
    if (!import_node_fs8.default.existsSync(dir)) continue;
    for (const entry of import_node_fs8.default.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      out.push(readSummary(import_node_path8.default.join(dir, entry.name), stateKey));
    }
  }
  return out;
}
function findJobLocation(hubRoot, jobId) {
  for (const stateKey of Object.keys(STATE_FOLDERS)) {
    const dir = import_node_path8.default.join(hubRoot, STATE_FOLDERS[stateKey], jobId);
    if (import_node_fs8.default.existsSync(dir)) return { state: stateKey, dir };
  }
  return null;
}
function move(hubRoot, jobId, from, to) {
  const src = import_node_path8.default.join(hubRoot, STATE_FOLDERS[from], jobId);
  const dest = import_node_path8.default.join(hubRoot, STATE_FOLDERS[to], jobId);
  import_node_fs8.default.mkdirSync(import_node_path8.default.dirname(dest), { recursive: true });
  import_node_fs8.default.rmSync(dest, { recursive: true, force: true });
  import_node_fs8.default.renameSync(src, dest);
}
function setApproval(jobFolder, state2) {
  const file = import_node_path8.default.join(jobFolder, "job.json");
  const m = JSON.parse(import_node_fs8.default.readFileSync(file, "utf-8"));
  m.approval = { ...m.approval ?? { mode: "require_approval" }, state: state2 };
  import_node_fs8.default.writeFileSync(file, JSON.stringify(m, null, 2), "utf-8");
}
function jobAction(hubRoot, jobId, action) {
  const loc = findJobLocation(hubRoot, jobId);
  if (!loc) return { success: false, error: "job not found" };
  switch (action) {
    case "cancel":
      if (!["incoming", "validating", "waiting_approval"].includes(loc.state)) return { success: false, error: "\u05D4\u05E2\u05D1\u05D5\u05D3\u05D4 \u05DB\u05D1\u05E8 \u05D0\u05D9\u05E0\u05D4 \u05D1\u05EA\u05D5\u05E8" };
      move(hubRoot, jobId, loc.state, "canceled");
      return { success: true };
    case "reject":
      if (loc.state !== "waiting_approval") return { success: false, error: "\u05D4\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D0\u05D9\u05E0\u05D4 \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8" };
      setApproval(loc.dir, "rejected");
      move(hubRoot, jobId, loc.state, "rejected");
      return { success: true };
    case "approve":
      if (loc.state !== "waiting_approval") return { success: false, error: "\u05D4\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D0\u05D9\u05E0\u05D4 \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8" };
      setApproval(loc.dir, "approved");
      move(hubRoot, jobId, loc.state, "incoming");
      return { success: true };
    case "retry":
      if (loc.state !== "failed") return { success: false, error: "\u05E0\u05D9\u05EA\u05DF \u05DC\u05D4\u05D3\u05E4\u05D9\u05E1 \u05E9\u05D5\u05D1 \u05E8\u05E7 \u05E2\u05D1\u05D5\u05D3\u05D4 \u05E9\u05E0\u05DB\u05E9\u05DC\u05D4" };
      move(hubRoot, jobId, loc.state, "incoming");
      return { success: true };
    case "archive":
      move(hubRoot, jobId, loc.state, "archived");
      return { success: true };
    case "delete":
      import_node_fs8.default.rmSync(loc.dir, { recursive: true, force: true });
      return { success: true };
    default:
      return { success: false, error: `unknown action: ${String(action)}` };
  }
}

// src/core/printHub/printerCaps.ts
var import_node_child_process = require("node:child_process");
var PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$code = 'using System;using System.Runtime.InteropServices;public class PaperCaps{[DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]public static extern int DeviceCapabilities(string device,string port,int cap,IntPtr buf,IntPtr dm);}'
Add-Type -TypeDefinition $code | Out-Null
$name=$env:SPP_PRINTER
$count=[PaperCaps]::DeviceCapabilities($name,$null,16,[IntPtr]::Zero,[IntPtr]::Zero)
if($count -le 0){ '[]'; return }
$namesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*64*2)
[PaperCaps]::DeviceCapabilities($name,$null,16,$namesBuf,[IntPtr]::Zero) | Out-Null
$sizesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*8)
[PaperCaps]::DeviceCapabilities($name,$null,3,$sizesBuf,[IntPtr]::Zero) | Out-Null
$list=New-Object System.Collections.ArrayList
for($i=0;$i -lt $count;$i++){
  $p=[IntPtr]::Add($namesBuf,$i*64*2)
  $pn=([Runtime.InteropServices.Marshal]::PtrToStringUni($p,64)).Trim([char]0).Trim()
  $x=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8)
  $y=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8+4)
  [void]$list.Add([pscustomobject]@{name=$pn;widthMm=[math]::Round($x/10,1);heightMm=[math]::Round($y/10,1)})
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($namesBuf)
[Runtime.InteropServices.Marshal]::FreeHGlobal($sizesBuf)
$list | ConvertTo-Json -Compress
`;
function getPrinterPapers(printerName) {
  if (process.platform !== "win32" || !printerName) return Promise.resolve([]);
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const proc = (0, import_node_child_process.spawn)("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      env: { ...process.env, SPP_PRINTER: printerName }
    });
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    const timer = setTimeout(() => {
      proc.kill();
      resolve([]);
    }, 15e3);
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out.trim() || "[]");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        resolve(arr.filter((p) => p && typeof p.name === "string" && p.widthMm > 0 && p.heightMm > 0));
      } catch {
        resolve([]);
      }
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}

// src/core/printHub/hubConfig.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_fs9 = __toESM(require("node:fs"), 1);
var import_node_path9 = __toESM(require("node:path"), 1);
var DEFAULT_LAN_PORT = 8788;
function hubConfigPath(hubRoot) {
  return import_node_path9.default.join(hubRoot, "config", "hub.json");
}
function loadHubConfig(hubRoot) {
  try {
    const raw = JSON.parse(import_node_fs9.default.readFileSync(hubConfigPath(hubRoot), "utf-8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
function saveHubConfig(hubRoot, patch) {
  const merged = { ...loadHubConfig(hubRoot), ...patch };
  const file = hubConfigPath(hubRoot);
  import_node_fs9.default.mkdirSync(import_node_path9.default.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  import_node_fs9.default.writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf-8");
  import_node_fs9.default.renameSync(tmp, file);
  return merged;
}
function getLanPort(hubRoot) {
  const p = loadHubConfig(hubRoot).lanPort;
  return typeof p === "number" && p > 0 && p < 65536 ? p : DEFAULT_LAN_PORT;
}
var TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function randomToken() {
  const bytes = import_node_crypto.default.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
function getOrCreatePairingToken(hubRoot) {
  const cfg = loadHubConfig(hubRoot);
  if (typeof cfg.pairingToken === "string" && cfg.pairingToken.length > 0) return cfg.pairingToken;
  const token = randomToken();
  saveHubConfig(hubRoot, { pairingToken: token });
  return token;
}
function tokensMatch(a, b) {
  const norm = (s) => s.replace(/[-\s]/g, "").toUpperCase();
  const na = Buffer.from(norm(a));
  const nb = Buffer.from(norm(b));
  if (na.length === 0 || na.length !== nb.length) return false;
  return import_node_crypto.default.timingSafeEqual(na, nb);
}

// src/core/printHub/serverEngine.ts
var import_node_fs10 = __toESM(require("node:fs"), 1);
var import_node_path10 = __toESM(require("node:path"), 1);

// src/core/printHub/stateMachine.ts
var TRANSITIONS = {
  incoming: ["validating", "canceled"],
  validating: ["waiting_approval", "printing", "failed", "canceled"],
  waiting_approval: ["printing", "rejected", "canceled"],
  printing: ["done", "failed", "canceled"],
  done: ["archived"],
  failed: ["printing", "archived", "canceled"],
  // failed jobs may be retried (printing) or archived
  rejected: ["archived"],
  canceled: ["archived"],
  archived: []
};
function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
var IllegalTransitionError = class extends Error {
  constructor(from, to) {
    super(`Illegal Print Hub transition: ${from} -> ${to}`);
    this.from = from;
    this.to = to;
    this.name = "IllegalTransitionError";
  }
  from;
  to;
};
function transition(from, to, by, note, now = (/* @__PURE__ */ new Date()).toISOString()) {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return { state: to, at: now, by, ...note ? { note } : {} };
}

// src/core/printHub/serverEngine.ts
var PRINTED_SIDECAR = "printed.json";
var MICRONS_PER_MM2 = 1e3;
function appendHistory(deps2, manifest, from, to, note) {
  const entry = transition(from, to, deps2.serverName, note);
  return { ...manifest, statusHistory: [...manifest.statusHistory, entry] };
}
function readPrinted(jobFolder) {
  const file = import_node_path10.default.join(jobFolder, PRINTED_SIDECAR);
  if (!import_node_fs10.default.existsSync(file)) return /* @__PURE__ */ new Set();
  try {
    const data = JSON.parse(import_node_fs10.default.readFileSync(file, "utf-8"));
    return new Set(data.printed ?? []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function writePrinted(jobFolder, printed) {
  import_node_fs10.default.writeFileSync(import_node_path10.default.join(jobFolder, PRINTED_SIDECAR), JSON.stringify({ printed: [...printed] }, null, 2));
}
function physicalPageForRenderedFile(preset, file) {
  const bleed = Math.max(0, preset.bleedMm);
  const widthMm = preset.widthMm + 2 * bleed;
  const heightMm = preset.heightMm + 2 * bleed;
  const shortMm = Math.min(widthMm, heightMm);
  const longMm = Math.max(widthMm, heightMm);
  const renderedLandscape = (file.renderedWidthPx ?? 0) >= (file.renderedHeightPx ?? Number.POSITIVE_INFINITY);
  return {
    pageWidthMicrons: Math.round((renderedLandscape ? longMm : shortMm) * MICRONS_PER_MM2),
    pageHeightMicrons: Math.round((renderedLandscape ? shortMm : longMm) * MICRONS_PER_MM2)
  };
}
async function processJob(deps2, jobId) {
  let folder = transitionJobFolder(deps2.hubRoot, jobId, "incoming", "validating");
  let manifest = readManifest(folder);
  manifest = appendHistory(deps2, manifest, "incoming", "validating");
  writeManifest(folder, manifest);
  deps2.onJobState?.(jobId, "validating", manifest);
  const target = deps2.resolveTarget(manifest);
  if (target === null) {
    folder = transitionJobFolder(deps2.hubRoot, jobId, "validating", "failed");
    manifest = appendHistory(deps2, manifest, "validating", "failed", "no matching printer/preset");
    writeManifest(folder, manifest);
    deps2.onJobState?.(jobId, "failed", manifest);
    return { jobId, finalState: "failed", error: "no matching printer/preset" };
  }
  if (deps2.isDuplicate?.(manifest) === true) {
    folder = transitionJobFolder(deps2.hubRoot, jobId, "validating", "failed");
    manifest = appendHistory(deps2, manifest, "validating", "failed", "duplicate \u2014 already printed");
    writeManifest(folder, manifest);
    deps2.onJobState?.(jobId, "failed", manifest);
    return { jobId, finalState: "failed", error: "duplicate \u2014 already printed" };
  }
  const needsApproval = deps2.requiresApproval ? deps2.requiresApproval(manifest) : manifest.approval.mode === "require_approval" && manifest.approval.state !== "approved";
  if (needsApproval) {
    folder = transitionJobFolder(deps2.hubRoot, jobId, "validating", "waiting_approval");
    manifest = appendHistory(deps2, manifest, "validating", "waiting_approval");
    manifest = { ...manifest, approval: { ...manifest.approval, state: "pending" } };
    writeManifest(folder, manifest);
    deps2.onJobState?.(jobId, "waiting_approval", manifest);
    return { jobId, finalState: "waiting_approval" };
  }
  return printJob(deps2, jobId, "validating", manifest, target);
}
async function printJob(deps2, jobId, from, manifestIn, target) {
  let folder = transitionJobFolder(deps2.hubRoot, jobId, from, "printing");
  let manifest = appendHistory(deps2, manifestIn, from, "printing");
  writeManifest(folder, manifest);
  deps2.onJobState?.(jobId, "printing", manifest);
  const alreadyPrinted = readPrinted(folder);
  const jobCopies = Math.max(1, manifest.requestedOutput.copies);
  const effectiveFiles = manifest.testPrintFirstOnly === true ? manifest.files.slice(0, 1) : manifest.files;
  const remaining = effectiveFiles.filter((f) => !alreadyPrinted.has(f.path)).map((f) => ({
    filePath: import_node_path10.default.join(folder, f.path),
    copies: Math.max(1, f.copies) * jobCopies,
    ...physicalPageForRenderedFile(target.preset, f)
  }));
  const request = {
    jobId,
    preset: target.preset,
    windowsPrinterName: target.profile.windowsPrinterName,
    images: remaining
  };
  let result;
  try {
    result = await deps2.adapter.print(request);
  } catch (err) {
    result = { success: false, printedFiles: [], error: err instanceof Error ? err.message : String(err) };
  }
  const absToRel = new Map(manifest.files.map((f) => [import_node_path10.default.join(folder, f.path), f.path]));
  for (const abs of result.printedFiles) {
    const rel = absToRel.get(abs) ?? abs;
    alreadyPrinted.add(rel);
  }
  writePrinted(folder, alreadyPrinted);
  const allDone = effectiveFiles.every((f) => alreadyPrinted.has(f.path));
  if (result.success && allDone) {
    folder = transitionJobFolder(deps2.hubRoot, jobId, "printing", "done");
    manifest = appendHistory(deps2, manifest, "printing", "done");
    writeManifest(folder, manifest);
    deps2.onCompleted?.(manifest);
    deps2.onJobState?.(jobId, "done", manifest);
    return { jobId, finalState: "done" };
  }
  folder = transitionJobFolder(deps2.hubRoot, jobId, "printing", "failed");
  const note = result.error ?? "print incomplete";
  manifest = appendHistory(deps2, manifest, "printing", "failed", note);
  writeManifest(folder, manifest);
  deps2.onJobState?.(jobId, "failed", manifest);
  return { jobId, finalState: "failed", error: note };
}

// src/printHubServer/lanServer.ts
var import_node_http = __toESM(require("node:http"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_busboy = __toESM(require_lib(), 1);
var import_node_fs12 = __toESM(require("node:fs"), 1);

// src/core/printHub/lanIngest.ts
var import_node_fs11 = __toESM(require("node:fs"), 1);
var import_node_path11 = __toESM(require("node:path"), 1);
function isDuplicateJob(hubRoot, manifest) {
  return isDuplicateFingerprint(hubRoot, manifest.jobFingerprint);
}
function sanitizeJobRelPath(filename) {
  if (typeof filename !== "string" || filename.length === 0) return null;
  const norm = filename.trim();
  if (norm.includes("\\") || norm.includes("..") || norm.startsWith("/")) return null;
  const m = /^(images|previews)\/([A-Za-z0-9._-]+)$/.exec(norm);
  return m ? `${m[1]}/${m[2]}` : null;
}
function beginIngest(hubRoot, manifest) {
  ensureHubLayout(hubRoot);
  const stagingDir2 = beginJobStaging(hubRoot, manifest.jobId);
  const expected = new Set(manifest.files.map((f) => f.path));
  return { hubRoot, jobId: manifest.jobId, stagingDir: stagingDir2, expected, received: /* @__PURE__ */ new Set() };
}
function resolvePart(handle, filename) {
  const rel = sanitizeJobRelPath(filename);
  if (rel === null) return null;
  const absPath = import_node_path11.default.join(handle.stagingDir, rel);
  import_node_fs11.default.mkdirSync(import_node_path11.default.dirname(absPath), { recursive: true });
  return { absPath, rel };
}
function markReceived(handle, rel) {
  handle.received.add(rel);
}
function missingFiles(handle) {
  return [...handle.expected].filter((rel) => !handle.received.has(rel));
}
function finalizeIngest(handle, manifest) {
  const missing = missingFiles(handle);
  if (missing.length > 0) {
    throw new Error(`missing image parts: ${missing.join(", ")}`);
  }
  writeManifest(handle.stagingDir, manifest);
  const dest = finalizeJob(handle.hubRoot, handle.jobId);
  return { jobId: handle.jobId, dest };
}
function abortIngest(handle) {
  try {
    import_node_fs11.default.rmSync(handle.stagingDir, { recursive: true, force: true });
  } catch {
  }
}
function hasFreeSpace(hubRoot, needBytes) {
  if (!Number.isFinite(needBytes) || needBytes <= 0) return true;
  const statfs = import_node_fs11.default.statfsSync;
  if (typeof statfs !== "function") return true;
  try {
    const s = statfs(hubRoot);
    const free = s.bavail * s.bsize;
    return free > needBytes + 64 * 1024 * 1024;
  } catch {
    return true;
  }
}

// src/printHubServer/lanServer.ts
var SERVER_VERSION = "1";
function lanIPv4Addresses() {
  const out = [];
  const ifaces = import_node_os.default.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    }
  }
  return out;
}
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}
function handleHealth(res, deps2) {
  let queueDepth = 0;
  try {
    queueDepth = listReadyJobIds(deps2.getHubRoot()).length;
  } catch {
  }
  sendJson(res, 200, {
    ok: true,
    hubName: deps2.getServerName(),
    version: SERVER_VERSION,
    ready: !deps2.isPaused(),
    queueDepth
  });
}
function handlePrintJob(req, res, deps2) {
  const hubRoot = deps2.getHubRoot();
  const token = String(req.headers["x-spp-token"] ?? "");
  if (!tokensMatch(token, getOrCreatePairingToken(hubRoot))) {
    req.resume();
    sendJson(res, 401, { success: false, error: "unauthorized" });
    return;
  }
  const declaredBytes = Number(req.headers["x-spp-job-bytes"] ?? 0);
  if (declaredBytes > 0 && !hasFreeSpace(hubRoot, declaredBytes)) {
    req.resume();
    sendJson(res, 507, { success: false, error: "insufficient disk space on hub" });
    return;
  }
  let bb;
  try {
    bb = (0, import_busboy.default)({ headers: req.headers });
  } catch {
    req.resume();
    sendJson(res, 400, { success: false, error: "invalid multipart request" });
    return;
  }
  let manifestJson = "";
  let manifest = null;
  let handle = null;
  let manifestSeen = false;
  let responded = false;
  let fatal = null;
  const filePromises = [];
  const fail = (status, error) => {
    if (!fatal) fatal = { status, error };
  };
  const finish = () => {
    if (responded) return;
    responded = true;
    if (handle && fatal) abortIngest(handle);
    if (fatal) {
      sendJson(res, fatal.status, { success: false, error: fatal.error });
      return;
    }
    sendJson(res, 200, body200);
  };
  let body200 = { success: true };
  bb.on("field", (name, val) => {
    if (name === "manifest") manifestJson = val;
  });
  bb.on("file", (name, stream, info) => {
    if (!manifestSeen) {
      manifestSeen = true;
      try {
        manifest = parseManifest(manifestJson);
        if (import_node_fs12.default.existsSync(jobDir(hubRoot, "incoming", manifest.jobId))) {
          fail(409, "job already queued");
        } else if (isDuplicateJob(hubRoot, manifest)) {
          body200 = { success: true, jobId: manifest.jobId, duplicate: true };
        } else {
          handle = beginIngest(hubRoot, manifest);
          body200 = { success: true, jobId: manifest.jobId, destination: "incoming" };
        }
      } catch (err) {
        fail(400, `manifest invalid: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (handle === null || fatal) {
      stream.resume();
      return;
    }
    const part = resolvePart(handle, info.filename);
    if (part === null) {
      fail(400, `unsafe or unexpected filename: ${info.filename}`);
      stream.resume();
      return;
    }
    const activeHandle = handle;
    const p = new Promise((resolve) => {
      const ws = import_node_fs12.default.createWriteStream(part.absPath);
      ws.on("error", () => {
        fail(500, `write failed: ${part.rel}`);
        resolve();
      });
      ws.on("finish", () => {
        markReceived(activeHandle, part.rel);
        resolve();
      });
      stream.on("error", () => {
        fail(500, `upload stream error: ${part.rel}`);
        ws.destroy();
        resolve();
      });
      stream.pipe(ws);
    });
    filePromises.push(p);
  });
  bb.on("error", () => fail(400, "malformed multipart body"));
  bb.on("close", () => {
    void Promise.all(filePromises).then(() => {
      if (!manifestSeen) {
        fail(400, "no image parts received");
        finish();
        return;
      }
      if (handle && manifest && !fatal) {
        try {
          finalizeIngest(handle, manifest);
        } catch (err) {
          fail(400, err instanceof Error ? err.message : String(err));
        }
      }
      finish();
    });
  });
  req.pipe(bb);
}
function startLanServer(deps2) {
  const port = getLanPort(deps2.getHubRoot());
  const server = import_node_http.default.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    try {
      if (req.method === "GET" && url === "/health") {
        handleHealth(res, deps2);
        return;
      }
      if (req.method === "POST" && url === "/print-jobs") {
        handlePrintJob(req, res, deps2);
        return;
      }
      sendJson(res, 404, { success: false, error: "not found" });
    } catch (err) {
      deps2.log(`\u26A0 LAN request error: ${err instanceof Error ? err.message : String(err)}`);
      try {
        sendJson(res, 500, { success: false, error: "internal error" });
      } catch {
      }
    }
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      deps2.log(`\u26A0 LAN: \u05D4\u05E4\u05D5\u05E8\u05D8 ${port} \u05EA\u05E4\u05D5\u05E1 \u2014 \u05E9\u05DC\u05D9\u05D7\u05D4 \u05D1\u05E8\u05E9\u05EA \u05DE\u05D5\u05E9\u05D1\u05EA\u05EA. \u05E1\u05D2\u05D5\u05E8 \u05D0\u05EA \u05D4\u05EA\u05D5\u05DB\u05E0\u05D4 \u05E9\u05EA\u05D5\u05E4\u05E1\u05EA \u05D0\u05D5\u05EA\u05D5 \u05D0\u05D5 \u05E9\u05E0\u05D4 lanPort \u05D1-hub.json.`);
    } else {
      deps2.log(`\u26A0 LAN server error: ${err.message}`);
    }
  });
  server.listen(port, "0.0.0.0");
  return {
    close: () => {
      try {
        server.close();
      } catch {
      }
    },
    addresses: () => lanIPv4Addresses().map((ip) => `${ip}:${port}`),
    port,
    token: () => getOrCreatePairingToken(deps2.getHubRoot())
  };
}

// src/printHubServer/cloudStatusSync.ts
var import_node_fs13 = __toESM(require("node:fs"), 1);
var import_node_path12 = __toESM(require("node:path"), 1);

// src/core/printHub/cloudStatus.ts
function base64UrlDecode(input) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function decodeJwtUserId(accessToken) {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
function lastNote(manifest) {
  const last = manifest.statusHistory[manifest.statusHistory.length - 1];
  return last?.note && last.note.length > 0 ? last.note : null;
}
function manifestToStatusRow(userId, targetComputer, state2, manifest) {
  const out = manifest.requestedOutput;
  return {
    user_id: userId,
    job_id: manifest.jobId,
    source_computer: manifest.sourceComputer ?? "",
    target_computer: targetComputer,
    customer_name: manifest.customer?.name ?? "",
    size: out.size,
    finish: out.finish,
    border_mode: out.borderMode,
    copies: out.copies,
    image_count: manifest.files.length,
    state: String(state2),
    error: state2 === "failed" ? lastNote(manifest) : null
  };
}
var TABLE_PATH = "/rest/v1/print_jobs";
function buildUpsertUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}${TABLE_PATH}?on_conflict=user_id,job_id`;
}

// src/printHubServer/cloudStatusSync.ts
var state = null;
var configFile = "";
var log = () => {
};
function persist() {
  if (!configFile) return;
  try {
    import_node_fs13.default.mkdirSync(import_node_path12.default.dirname(configFile), { recursive: true });
    const tmp = `${configFile}.tmp`;
    import_node_fs13.default.writeFileSync(tmp, JSON.stringify(state ?? {}, null, 2), "utf-8");
    import_node_fs13.default.renameSync(tmp, configFile);
  } catch {
  }
}
function initCloudStatusSync(userDataDir, logger) {
  log = logger;
  configFile = import_node_path12.default.join(userDataDir, "print-hub-cloud.json");
  try {
    const raw = JSON.parse(import_node_fs13.default.readFileSync(configFile, "utf-8"));
    if (raw && typeof raw.supabaseUrl === "string" && typeof raw.accessToken === "string" && typeof raw.userId === "string") {
      state = {
        supabaseUrl: raw.supabaseUrl,
        anonKey: String(raw.anonKey ?? ""),
        accessToken: raw.accessToken,
        refreshToken: String(raw.refreshToken ?? ""),
        expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : 0,
        userId: raw.userId
      };
    }
  } catch {
  }
}
function setCloudSession(payload) {
  if (!payload?.supabaseUrl || !payload.accessToken) {
    return { ok: false };
  }
  const userId = payload.userId ?? decodeJwtUserId(payload.accessToken) ?? "";
  if (!userId) return { ok: false };
  state = {
    supabaseUrl: payload.supabaseUrl.replace(/\/+$/, ""),
    anonKey: payload.anonKey ?? "",
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? "",
    expiresAt: typeof payload.expiresAt === "number" ? payload.expiresAt : 0,
    userId
  };
  persist();
  return { ok: true, userId };
}
async function ensureFreshToken() {
  if (!state) return false;
  if (state.expiresAt > Date.now() + 6e4) return true;
  if (!state.refreshToken || !state.anonKey) return state.accessToken.length > 0;
  try {
    const res = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: state.anonKey },
      body: JSON.stringify({ refresh_token: state.refreshToken })
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (typeof body.access_token !== "string") return false;
    state = {
      ...state,
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : state.refreshToken,
      expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1e3
    };
    persist();
    return true;
  } catch {
    return false;
  }
}
async function upsertJobStatus(targetComputer, jobState, manifest) {
  if (!state) return;
  try {
    const fresh = await ensureFreshToken();
    if (!fresh || !state) return;
    const row = manifestToStatusRow(state.userId, targetComputer, jobState, manifest);
    const res = await fetch(buildUpsertUrl(state.supabaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: state.anonKey,
        Authorization: `Bearer ${state.accessToken}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      log(`\u2601 \u05E1\u05E0\u05DB\u05E8\u05D5\u05DF \u05E1\u05D8\u05D8\u05D5\u05E1 \u05E0\u05DB\u05E9\u05DC (${res.status}) \u05DC\u05E2\u05D1\u05D5\u05D3\u05D4 ${manifest.jobId}`);
    }
  } catch (err) {
    log(`\u2601 \u05E9\u05D2\u05D9\u05D0\u05EA \u05E1\u05E0\u05DB\u05E8\u05D5\u05DF \u05E2\u05E0\u05DF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// src/printHubServer/serverMain.ts
var POLL_INTERVAL_MS = 4e3;
var currentHubRoot = "";
var serverName = "";
var deps;
var seenJobs = /* @__PURE__ */ new Set();
var paused = false;
var processing = false;
var incomingWatcher = null;
var watchDebounce = null;
var lanServer = null;
function setupIncomingWatcher() {
  try {
    incomingWatcher?.close();
  } catch {
  }
  incomingWatcher = null;
  try {
    const incoming = hubStateDir(currentHubRoot, "incoming");
    import_node_fs14.default.mkdirSync(incoming, { recursive: true });
    incomingWatcher = import_node_fs14.default.watch(incoming, { persistent: true }, () => {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => void tick(), 300);
    });
  } catch {
  }
}
function serverConfigPath() {
  return import_node_path13.default.join(import_electron.app.getPath("userData"), "print-hub-server.json");
}
function loadPersistedHubRoot() {
  try {
    const c = JSON.parse(import_node_fs14.default.readFileSync(serverConfigPath(), "utf-8"));
    return typeof c.hubRoot === "string" && c.hubRoot.length > 0 ? c.hubRoot : null;
  } catch {
    return null;
  }
}
function persistHubRoot(hubRoot) {
  try {
    import_node_fs14.default.mkdirSync(import_node_path13.default.dirname(serverConfigPath()), { recursive: true });
    import_node_fs14.default.writeFileSync(serverConfigPath(), JSON.stringify({ hubRoot }, null, 2), "utf-8");
  } catch {
  }
}
function resolveHubRoot() {
  const fromArg = process.argv.find((a) => a.startsWith("--hub="));
  if (fromArg) return fromArg.slice("--hub=".length);
  if (process.env.SPP_HUB_ROOT) return process.env.SPP_HUB_ROOT;
  const persisted = loadPersistedHubRoot();
  if (persisted) return persisted;
  return process.platform === "win32" ? "C:\\SPP_PrintHub" : import_node_path13.default.join(import_node_os2.default.homedir(), "SPP_PrintHub");
}
function serverLog(message) {
  const line = `[${(/* @__PURE__ */ new Date()).toLocaleString("he-IL")}] ${message}`;
  try {
    const dir = import_node_path13.default.join(currentHubRoot, "logs");
    import_node_fs14.default.mkdirSync(dir, { recursive: true });
    import_node_fs14.default.appendFileSync(import_node_path13.default.join(dir, "server.log"), `${line}
`, "utf-8");
  } catch {
  }
  console.log(`[PrintHub] ${message}`);
}
function createElectronPrintImage() {
  return (filePath, options) => new Promise((resolve, reject) => {
    const win = new import_electron.BrowserWindow({ show: false, webPreferences: { offscreen: false } });
    const tmpHtml = import_node_path13.default.join(import_node_os2.default.tmpdir(), `spp_print_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
    const imgUrl = (0, import_node_url.pathToFileURL)(filePath).href;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;width:100%;height:100%}
        img{width:100%;height:100%;object-fit:cover;display:block}
      </style></head><body><img id="spp-print-img" src="${imgUrl}"></body></html>`;
    const cleanup = () => {
      try {
        import_node_fs14.default.unlinkSync(tmpHtml);
      } catch {
      }
      if (!win.isDestroyed()) win.close();
    };
    try {
      import_node_fs14.default.writeFileSync(tmpHtml, html, "utf-8");
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    win.webContents.once("did-finish-load", () => {
      void win.webContents.executeJavaScript(`new Promise(function(res){
            var i=document.getElementById('spp-print-img');
            if(!i){res(false);return;}
            if(i.complete && i.naturalWidth>0){res(true);return;}
            i.onload=function(){res(true)}; i.onerror=function(){res(false)};
          })`).then((loaded) => {
        if (loaded !== true) {
          cleanup();
          reject(new Error(`image did not load: ${filePath}`));
          return;
        }
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: options.printerName,
            margins: { marginType: "none" },
            pageSize: { width: options.pageWidthMicrons, height: options.pageHeightMicrons }
          },
          (success, failureReason) => {
            cleanup();
            if (success) resolve();
            else reject(new Error(failureReason || "print failed"));
          }
        );
      }).catch((err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
    win.loadFile(tmpHtml).catch((err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
function notify(title, body) {
  if (!import_electron.Notification.isSupported()) return;
  try {
    new import_electron.Notification({ title, body }).show();
  } catch {
  }
}
function jobNotificationBody(manifest) {
  const o = manifest.requestedOutput;
  const who = manifest.customer.name ? `${manifest.customer.name} \xB7 ` : "";
  const from = manifest.sourceComputer ? `\u05DE-${manifest.sourceComputer} \xB7 ` : "";
  return `${who}${from}${o.size} \xB7 ${manifest.files.length} \u05EA\u05DE\u05D5\u05E0\u05D5\u05EA`;
}
function buildDeps() {
  const adapter = createSpoolerAdapter(createElectronPrintImage());
  return {
    hubRoot: currentHubRoot,
    serverName,
    adapter,
    resolveTarget: (manifest) => resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest),
    requiresApproval: (manifest) => requiresApprovalForJob(loadStations(currentHubRoot), manifest),
    isDuplicate: (manifest) => isDuplicateFingerprint(currentHubRoot, manifest.jobFingerprint),
    onCompleted: (manifest) => {
      appendProductionLog(currentHubRoot, manifest);
      const target = resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest);
      if (target) consumeMedia(currentHubRoot, target.preset.id, jobPrintCount(manifest));
      serverLog(`\u2713 \u05E2\u05D1\u05D5\u05D3\u05D4 ${manifest.jobId} \u05D4\u05D5\u05D3\u05E4\u05E1\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4 (${jobPrintCount(manifest)} \u05EA\u05DE\u05D5\u05E0\u05D5\u05EA)`);
      void upsertJobStatus(serverName, "done", manifest);
    },
    onJobState: (jobId, state2, manifest) => {
      const last = manifest.statusHistory[manifest.statusHistory.length - 1];
      const note = last?.note ? ` \u2014 ${last.note}` : "";
      serverLog(`\u05E2\u05D1\u05D5\u05D3\u05D4 ${jobId}: ${state2}${note}`);
      if (state2 === "printing") {
        const t = resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest);
        serverLog(`  \u2192 \u05E9\u05D5\u05DC\u05D7 \u05DC\u05D4\u05D3\u05E4\u05E1\u05D4 \u05D1\u05DE\u05D3\u05E4\u05E1\u05EA "${t?.profile.windowsPrinterName ?? "?"}" \xB7 \u05E4\u05E8\u05D9\u05E1\u05D8 ${t?.preset.name ?? "?"}`);
      }
      if (state2 === "waiting_approval") notify("\u05E2\u05D1\u05D5\u05D3\u05D4 \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC", jobNotificationBody(manifest));
      void upsertJobStatus(serverName, state2, manifest);
    }
  };
}
async function tick() {
  if (paused || processing) return;
  processing = true;
  try {
    const ready = listReadyJobIds(currentHubRoot);
    for (const jobId of ready) {
      if (!seenJobs.has(jobId)) {
        seenJobs.add(jobId);
        serverLog(`\u{1F4E5} \u05E2\u05D1\u05D5\u05D3\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05E0\u05E7\u05DC\u05D8\u05D4 \u05D1\u05EA\u05D5\u05E8: ${jobId}`);
        notify("\u05E2\u05D1\u05D5\u05D3\u05EA \u05D4\u05D3\u05E4\u05E1\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05D1\u05EA\u05D5\u05E8", jobId);
      }
      if (paused) break;
      await processJob(deps, jobId);
    }
  } catch (err) {
    serverLog(`\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05DC\u05D5\u05DC\u05D0\u05EA \u05D4\u05E2\u05D9\u05D1\u05D5\u05D3: ${errMsg(err)}`);
  } finally {
    processing = false;
  }
}
function assetPath(file) {
  return import_node_path13.default.join(__dirname, "assets", file);
}
function trayIcon() {
  const png = assetPath("spp2_standalone_32x32.png");
  if (import_node_fs14.default.existsSync(png)) {
    const img = import_electron.nativeImage.createFromPath(png);
    if (!img.isEmpty()) return img;
  }
  const ico = assetPath("spp2_standalone.ico");
  if (import_node_fs14.default.existsSync(ico)) {
    const img = import_electron.nativeImage.createFromPath(ico);
    if (!img.isEmpty()) return img;
  }
  const size = 32;
  const buf = Buffer.alloc(size * size * 4, 0);
  const set = (x, y, b, g, r, a) => {
    const i = (y * size + x) * 4;
    buf[i] = b;
    buf[i + 1] = g;
    buf[i + 2] = r;
    buf[i + 3] = a;
  };
  for (let y = 10; y <= 26; y += 1) for (let x = 5; x <= 26; x += 1) set(x, y, 235, 99, 37, 255);
  for (let y = 6; y < 11; y += 1) for (let x = 8; x <= 23; x += 1) set(x, y, 180, 70, 25, 255);
  for (let y = 16; y <= 20; y += 1) for (let x = 9; x <= 22; x += 1) set(x, y, 255, 255, 255, 255);
  return import_electron.nativeImage.createFromBitmap(buf, { width: size, height: size });
}
var mgmtWin = null;
function distIndexHtml() {
  return import_electron.app.isPackaged ? import_node_path13.default.join(process.resourcesPath, "app", "dist", "index.html") : import_node_path13.default.join(__dirname, "..", "dist", "index.html");
}
function openManagementWindow() {
  if (mgmtWin && !mgmtWin.isDestroyed()) {
    if (mgmtWin.isMinimized()) mgmtWin.restore();
    mgmtWin.show();
    mgmtWin.focus();
    return;
  }
  mgmtWin = new import_electron.BrowserWindow({
    width: 760,
    height: 860,
    title: "SPP2 Print Hub",
    backgroundColor: "#0f172a",
    icon: assetPath("spp2_standalone.ico"),
    webPreferences: {
      preload: import_node_path13.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void mgmtWin.loadFile(distIndexHtml(), { hash: "print-hub" });
  mgmtWin.on("closed", () => {
    mgmtWin = null;
  });
}
var RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
var RUN_NAME = "SPP2PrintHub";
var autostartOn = false;
var rebuildTrayMenu = () => {
};
function runReg(args) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ ok: false, stdout: "" });
      return;
    }
    const proc = (0, import_node_child_process2.spawn)("reg", args, { windowsHide: true });
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.on("close", (code) => resolve({ ok: code === 0, stdout: out }));
    proc.on("error", () => resolve({ ok: false, stdout: "" }));
  });
}
async function refreshAutostart() {
  const res = await runReg(["query", RUN_KEY, "/v", RUN_NAME]);
  autostartOn = res.ok && res.stdout.includes(RUN_NAME);
}
async function setAutostart(enabled) {
  if (enabled) {
    await runReg(["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", `"${process.execPath}" --print-hub-server`, "/f"]);
  } else {
    await runReg(["delete", RUN_KEY, "/v", RUN_NAME, "/f"]);
  }
  autostartOn = enabled;
  rebuildTrayMenu();
}
function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}
function readRetentionDays(hubRoot) {
  try {
    const cfg = JSON.parse(import_node_fs14.default.readFileSync(import_node_path13.default.join(hubRoot, "config", "hub.json"), "utf-8"));
    return typeof cfg.retentionDays === "number" ? cfg.retentionDays : 14;
  } catch {
    return 14;
  }
}
function readJsonFile(file, fallback) {
  try {
    if (!import_node_fs14.default.existsSync(file)) return fallback;
    return JSON.parse(import_node_fs14.default.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(file, value) {
  import_node_fs14.default.mkdirSync(import_node_path13.default.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  import_node_fs14.default.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  import_node_fs14.default.renameSync(tmp, file);
}
function exportSettingsSnapshot(hubRoot, appSettings) {
  ensureHubLayout(hubRoot);
  const configDir = import_node_path13.default.join(hubRoot, "config");
  const printers = readJsonFile(import_node_path13.default.join(configDir, "printers.json"), {});
  const stations = readJsonFile(import_node_path13.default.join(configDir, "stations.json"), {});
  const media = readJsonFile(import_node_path13.default.join(configDir, "media.json"), {});
  return {
    schemaVersion: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sourceComputer: serverName || import_node_os2.default.hostname(),
    hubRoot,
    appSettings: appSettings && typeof appSettings === "object" ? appSettings : null,
    hubConfig: loadHubConfig(hubRoot),
    profiles: Array.isArray(printers.profiles) ? printers.profiles : null,
    stations: Array.isArray(stations.stations) ? stations.stations : [],
    media: Array.isArray(media.items) ? media.items : []
  };
}
function importSettingsSnapshot(hubRoot, snapshot) {
  if (!hubRoot) throw new Error("missing hubRoot");
  if (!snapshot || typeof snapshot !== "object") throw new Error("invalid snapshot");
  const s = snapshot;
  ensureHubLayout(hubRoot);
  const configDir = import_node_path13.default.join(hubRoot, "config");
  if (s.hubConfig && typeof s.hubConfig === "object") saveHubConfig(hubRoot, s.hubConfig);
  if (Array.isArray(s.profiles)) writeJsonAtomic(import_node_path13.default.join(configDir, "printers.json"), { profiles: s.profiles });
  if (Array.isArray(s.stations)) writeJsonAtomic(import_node_path13.default.join(configDir, "stations.json"), { stations: s.stations });
  if (Array.isArray(s.media)) writeJsonAtomic(import_node_path13.default.join(configDir, "media.json"), { items: s.media });
  deps = buildDeps();
  return exportSettingsSnapshot(hubRoot, s.appSettings ?? null);
}
function setHubRoot(hubRoot) {
  if (!hubRoot || hubRoot === currentHubRoot) return;
  currentHubRoot = hubRoot;
  import_node_fs14.default.mkdirSync(currentHubRoot, { recursive: true });
  ensureHubLayout(currentHubRoot);
  persistHubRoot(currentHubRoot);
  deps = buildDeps();
  seenJobs.clear();
  setupIncomingWatcher();
  serverLog(`\u{1F4C2} \u05EA\u05D9\u05E7\u05D9\u05D9\u05EA \u05D4\u05EA\u05D5\u05E8 \u05E2\u05D5\u05D3\u05DB\u05E0\u05D4 \u05DC: ${currentHubRoot}`);
}
function registerManagementIpc() {
  const root = (h) => typeof h === "string" && h.length > 0 ? h : currentHubRoot;
  import_electron.ipcMain.handle("spp:printHub:station-info", async () => ({ success: true, computerName: serverName }));
  import_electron.ipcMain.handle("spp:printHub:get-server-hub", async () => ({ success: true, hubRoot: currentHubRoot, serverName }));
  import_electron.ipcMain.handle("spp:printHub:lan-info", async () => ({
    success: true,
    addresses: lanServer?.addresses() ?? [],
    port: lanServer?.port ?? 0,
    token: lanServer?.token() ?? ""
  }));
  import_electron.ipcMain.handle("spp:printHub:set-cloud-session", async (_e, payload) => {
    try {
      return setCloudSession(payload);
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:set-server-hub", async (_e, hubRoot) => {
    try {
      setHubRoot(String(hubRoot || ""));
      return { success: true, hubRoot: currentHubRoot };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:read-server-log", async (_e, hubRoot) => {
    try {
      const file = import_node_path13.default.join(root(hubRoot), "logs", "server.log");
      if (!import_node_fs14.default.existsSync(file)) return { success: true, lines: [] };
      const lines = import_node_fs14.default.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim()).slice(-300);
      return { success: true, lines };
    } catch (err) {
      return { success: false, lines: [], error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:list-queue", async (_e, hubRoot) => {
    try {
      return { success: true, jobs: listQueue(root(hubRoot)) };
    } catch (err) {
      return { success: false, jobs: [], error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:job-action", async (_e, payload) => {
    try {
      const result = jobAction(root(payload?.hubRoot), String(payload?.jobId || ""), payload?.action);
      if (result.success) {
        seenJobs.delete(String(payload?.jobId || ""));
        serverLog(`\u{1F464} \u05E4\u05E2\u05D5\u05DC\u05EA \u05DE\u05E0\u05D4\u05DC: ${payload?.action} \u05E2\u05DC ${payload?.jobId}`);
      }
      return result;
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:open-job-folder", async (_e, payload) => {
    try {
      const error = await import_electron.shell.openPath(root(payload?.hubRoot));
      return { success: !error, error: error || void 0 };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:get-printers", async (e) => {
    try {
      const printers = await e.sender.getPrintersAsync();
      return { success: true, printers: printers.map((p) => {
        const info = p;
        return { name: info.name, displayName: info.displayName || info.name, status: info.status ?? 0, isDefault: info.isDefault ?? false };
      }) };
    } catch (err) {
      return { success: false, printers: [], error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:load-profiles", async (_e, hubRoot) => {
    try {
      const file = import_node_path13.default.join(root(hubRoot), "config", "printers.json");
      if (!import_node_fs14.default.existsSync(file)) return { success: true, profiles: null };
      const parsed = JSON.parse(import_node_fs14.default.readFileSync(file, "utf-8"));
      return { success: true, profiles: Array.isArray(parsed.profiles) ? parsed.profiles : null };
    } catch (err) {
      return { success: false, profiles: null, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:save-profiles", async (_e, payload) => {
    try {
      saveProfiles(root(payload?.hubRoot), payload?.profiles ?? []);
      serverLog("\u2699 \u05E4\u05E8\u05D5\u05E4\u05D9\u05DC\u05D9 \u05DE\u05D3\u05E4\u05E1\u05EA \u05E0\u05E9\u05DE\u05E8\u05D5");
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:get-printer-papers", async (_e, printerName) => {
    try {
      return { success: true, papers: await getPrinterPapers(String(printerName || "")) };
    } catch (err) {
      return { success: false, papers: [], error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:load-stations", async (_e, hubRoot) => {
    try {
      return { success: true, stations: loadStations(root(hubRoot)) };
    } catch (err) {
      return { success: false, stations: null, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:save-stations", async (_e, payload) => {
    try {
      saveStations(root(payload?.hubRoot), payload?.stations ?? []);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:load-media", async (_e, hubRoot) => {
    try {
      return { success: true, items: loadMedia(root(hubRoot)) };
    } catch (err) {
      return { success: false, items: null, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:save-media", async (_e, payload) => {
    try {
      saveMedia(root(payload?.hubRoot), payload?.items ?? []);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:load-hub-config", async (_e, hubRoot) => {
    try {
      return { success: true, config: loadHubConfig(root(hubRoot)) };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:save-hub-config", async (_e, payload) => {
    try {
      return { success: true, config: saveHubConfig(root(payload?.hubRoot), payload?.config ?? {}) };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:export-settings", async (_e, payload) => {
    try {
      return { success: true, snapshot: exportSettingsSnapshot(root(payload?.hubRoot), payload?.appSettings ?? null) };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:import-settings", async (_e, payload) => {
    try {
      return { success: true, snapshot: importSettingsSnapshot(root(payload?.hubRoot), payload?.snapshot) };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:read-production-log", async (_e, payload) => {
    try {
      const date = payload?.date ? /* @__PURE__ */ new Date(`${String(payload.date)}T00:00:00`) : /* @__PURE__ */ new Date();
      return { success: true, entries: readProductionLog(root(payload?.hubRoot), date) };
    } catch (err) {
      return { success: false, entries: [], error: errMsg(err) };
    }
  });
  import_electron.ipcMain.handle("spp:printHub:install-context-menu", async () => ({ success: false, error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D6\u05D5 \u05D6\u05DE\u05D9\u05E0\u05D4 \u05DE\u05EA\u05D5\u05DA SPP2 \u05D1\u05EA\u05D7\u05E0\u05EA \u05D4\u05E2\u05D9\u05E6\u05D5\u05D1" }));
  import_electron.ipcMain.handle("spp:printHub:uninstall-context-menu", async () => ({ success: false, error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D6\u05D5 \u05D6\u05DE\u05D9\u05E0\u05D4 \u05DE\u05EA\u05D5\u05DA SPP2 \u05D1\u05EA\u05D7\u05E0\u05EA \u05D4\u05E2\u05D9\u05E6\u05D5\u05D1" }));
}
async function start() {
  serverName = import_node_os2.default.hostname();
  currentHubRoot = resolveHubRoot();
  import_node_fs14.default.mkdirSync(currentHubRoot, { recursive: true });
  ensureHubLayout(currentHubRoot);
  initCloudStatusSync(import_electron.app.getPath("userData"), serverLog);
  registerManagementIpc();
  deps = buildDeps();
  await refreshAutostart();
  if (process.argv.includes("--enable-autostart")) await setAutostart(true);
  serverLog(`\u{1F680} \u05E9\u05E8\u05EA \u05D4\u05D4\u05D3\u05E4\u05E1\u05D4 \u05E2\u05DC\u05D4 \u2014 ${serverName} \u2014 \u05EA\u05D9\u05E7\u05D9\u05D9\u05EA \u05EA\u05D5\u05E8: ${currentHubRoot}`);
  lanServer = startLanServer({
    getHubRoot: () => currentHubRoot,
    getServerName: () => serverName,
    isPaused: () => paused,
    log: serverLog
  });
  serverLog(`\u{1F310} LAN: ${lanServer.addresses().join(" / ") || `127.0.0.1:${lanServer.port}`} \xB7 \u05E7\u05D5\u05D3 \u05E9\u05D9\u05D5\u05DA: ${lanServer.token()}`);
  const tray = new import_electron.Tray(trayIcon());
  const rebuildMenu = () => {
    const lanLabel = lanServer ? lanServer.addresses().join("  ") || `127.0.0.1:${lanServer.port}` : "\u2014";
    const lanToken = lanServer ? lanServer.token() : "";
    tray.setContextMenu(
      import_electron.Menu.buildFromTemplate([
        { label: `SPP2 Print Hub \u2014 ${serverName}`, enabled: false },
        { label: currentHubRoot, enabled: false },
        { type: "separator" },
        { label: `\u{1F310} \u05DB\u05EA\u05D5\u05D1\u05EA LAN: ${lanLabel}`, enabled: false },
        { label: `\u{1F511} \u05E7\u05D5\u05D3 \u05E9\u05D9\u05D5\u05DA: ${lanToken}`, enabled: false },
        { label: "\u05D4\u05E2\u05EA\u05E7 \u05DB\u05EA\u05D5\u05D1\u05EA + \u05E7\u05D5\u05D3", click: () => {
          const { clipboard } = require("electron");
          clipboard.writeText(`${lanLabel}  \xB7  ${lanToken}`);
        } },
        { type: "separator" },
        { label: "\u05E4\u05EA\u05D7 \u05D7\u05DC\u05D5\u05DF \u05E0\u05D9\u05D4\u05D5\u05DC", click: openManagementWindow },
        { label: paused ? "\u05D4\u05DE\u05E9\u05DA \u05E2\u05D9\u05D1\u05D5\u05D3" : "\u05D4\u05E9\u05D4\u05D4 \u05E2\u05D9\u05D1\u05D5\u05D3", click: () => {
          paused = !paused;
          serverLog(paused ? "\u23F8 \u05E2\u05D9\u05D1\u05D5\u05D3 \u05D4\u05D5\u05E9\u05D4\u05D4" : "\u25B6 \u05E2\u05D9\u05D1\u05D5\u05D3 \u05D7\u05D5\u05D3\u05E9");
          rebuildMenu();
        } },
        { label: "\u05E4\u05EA\u05D7 \u05EA\u05D9\u05E7\u05D9\u05D9\u05EA \u05EA\u05D5\u05E8", click: () => void import_electron.shell.openPath(currentHubRoot) },
        { type: "checkbox", label: "\u05D4\u05E4\u05E2\u05DC \u05E2\u05DD Windows", checked: autostartOn, click: (item) => void setAutostart(item.checked) },
        { type: "separator" },
        { label: "\u05D9\u05E6\u05D9\u05D0\u05D4", click: () => import_electron.app.quit() }
      ])
    );
    tray.setToolTip(`SPP2 Print Hub${paused ? " (\u05DE\u05D5\u05E9\u05D4\u05D4)" : ""}`);
  };
  rebuildTrayMenu = rebuildMenu;
  rebuildMenu();
  tray.on("click", openManagementWindow);
  setupIncomingWatcher();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
  void tick();
  const purge = () => {
    try {
      purgeOldJobs(currentHubRoot, readRetentionDays(currentHubRoot));
    } catch {
    }
  };
  setInterval(purge, 60 * 60 * 1e3);
  purge();
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function acquireServerLock() {
  const lockFile = import_node_path13.default.join(import_electron.app.getPath("userData"), "print-hub-server.lock");
  try {
    if (import_node_fs14.default.existsSync(lockFile)) {
      const pid = parseInt(import_node_fs14.default.readFileSync(lockFile, "utf-8").trim(), 10);
      if (Number.isFinite(pid) && isProcessAlive(pid)) return false;
    }
    import_node_fs14.default.writeFileSync(lockFile, String(process.pid), "utf-8");
    import_electron.app.on("quit", () => {
      try {
        import_node_fs14.default.unlinkSync(lockFile);
      } catch {
      }
    });
    return true;
  } catch {
    return true;
  }
}
import_electron.app.whenReady().then(() => {
  if (!acquireServerLock()) {
    import_electron.app.quit();
    return;
  }
  void start();
});
import_electron.app.on("window-all-closed", () => {
});
