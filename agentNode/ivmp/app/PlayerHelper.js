  function getParametersFromUrl() {
      var query = location.search.substr(1);
      var result = {};
      query.split("&").forEach(function(part) {
          var item = part.split("=");
          result[item[0]] = decodeURIComponent(item[1]);
      });
      return result;
  }

  function getLoginDetails() {
      var loginDetails = {};
      try {
          var src = localStorage.getItem("loginDetails");
          if (src != undefined) {
              console.info(src);
              loginDetails = JSON.parse(src);
          }
      } catch (err) {
          console.error(err);
      }
      return loginDetails;
  }

  function getHeaders() {
      var ld = getLoginDetails();
      var header = {};
      if (ld.accessToken) {
          header.Authorization = 'Bearer ' + ld.accessToken;
      }
      return header;
  }

  function getServices() {
      var args = getParametersFromUrl();
      var services = location.protocol + '//' + location.hostname + ':8085/ws';

      if (args.services) {
          services = args.services;
      } else if (args.webService) {
          services = args.webService;
      }
      return services;
  }

  var UrlSafeBase64 = {
      _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.",

      encode: function(input) {
          var output = "";
          var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
          var i = 0;
          input = UrlSafeBase64._utf8_encode(input);
          while (i < input.length) {
              chr1 = input.charCodeAt(i++);
              chr2 = input.charCodeAt(i++);
              chr3 = input.charCodeAt(i++);

              enc1 = chr1 >> 2;
              enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
              enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
              enc4 = chr3 & 63;

              if (isNaN(chr2)) {
                  enc3 = enc4 = 64;
              } else if (isNaN(chr3)) {
                  enc4 = 64;
              }
              output = output + this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) + this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
          }
          return output;
      },

      decode: function(input) {
          var output = "";
          var chr1, chr2, chr3;
          var enc1, enc2, enc3, enc4;
          var i = 0;

          input = input.replace(/[^A-Za-z0-9\-\_\.]/g, "");
          while (i < input.length) {
              enc1 = this._keyStr.indexOf(input.charAt(i++));
              enc2 = this._keyStr.indexOf(input.charAt(i++));
              enc3 = this._keyStr.indexOf(input.charAt(i++));
              enc4 = this._keyStr.indexOf(input.charAt(i++));

              chr1 = (enc1 << 2) | (enc2 >> 4);
              chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
              chr3 = ((enc3 & 3) << 6) | enc4;

              output = output + String.fromCharCode(chr1);

              if (enc3 != 64) {
                  output = output + String.fromCharCode(chr2);
              }
              if (enc4 != 64) {
                  output = output + String.fromCharCode(chr3);
              }
          }
          output = UrlSafeBase64._utf8_decode(output);
          return output;
      },

      _utf8_encode: function(string) {
          string = string.replace(/\r\n/g, "\n");
          var utftext = "";

          for (var n = 0; n < string.length; n++) {

              var c = string.charCodeAt(n);

              if (c < 128) {
                  utftext += String.fromCharCode(c);
              } else if ((c > 127) && (c < 2048)) {
                  utftext += String.fromCharCode((c >> 6) | 192);
                  utftext += String.fromCharCode((c & 63) | 128);
              } else {
                  utftext += String.fromCharCode((c >> 12) | 224);
                  utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                  utftext += String.fromCharCode((c & 63) | 128);
              }
          }
          return utftext;
      },

      _utf8_decode: function(utftext) {
          var string = "";
          var i = 0;
          var c = c1 = c2 = 0;

          while (i < utftext.length) {
              c = utftext.charCodeAt(i);
              if (c < 128) {
                  string += String.fromCharCode(c);
                  i++;
              } else if ((c > 191) && (c < 224)) {
                  c2 = utftext.charCodeAt(i + 1);
                  string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                  i += 2;
              } else {
                  c2 = utftext.charCodeAt(i + 1);
                  c3 = utftext.charCodeAt(i + 2);
                  string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                  i += 3;
              }
          }
          return string;
      }
  }

  var _lastPop = { empty: true };
  var Pop = {
      // Sample pop block {c:{i:0,t:0,n:''},p:{i:0,t:0,n:''},v:{i:0,t:0,n:''},w:{s:0,d:0}} 
      swiped: function(ps) {
          var pd = JSON.parse(ps);
          if (_lastPop.empty) {
              _lastPop = pd;
              _lastPop.w = {};
              _lastPop.w.s = (new Date()).getTime();
              _lastPop.w.d = 0;
          } else {
              if ((pd.c.i != _lastPop.c.i) || (pd.c.t != _lastPop.c.t)) {
                  var now = (new Date()).getTime();
                  _lastPop.w.d = Math.floor(((now - _lastPop.w.s) / 1000) + .5); // seconds elapsed rounded
                  if (_lastPop.w.d > 2) {
                      // update pop
                      var p = UrlSafeBase64.encode(JSON.stringify(_lastPop));
                      $.ajax({
                          type: 'PUT',
                          url: getServices() + '/v1/popwrite?data=' + p,
                      }).done(function(data) {
                          //console.info('PopWrite succeeded');
                      }).fail(function(err) {
                          console.error('PopWrite failed: ' + err);
                      });
                  }
                  _lastPop = pd;
                  _lastPop.w = {};
                  _lastPop.w.s = now;
                  _lastPop.w.d = 0;
              }
          }
      },

      write: function(ps) {
          if (ps) {
              var p = UrlSafeBase64.encode(JSON.stringify(ps));
              $.ajax({
                  type: 'PUT',
                  url: getServices() + '/v1/popwrite?data=' + p,
              }).done(function(data) {
                  // console.info('PopWrite succeeded');
              }).fail(function(err) {
                  console.error('PopWrite failed: ' + err);
              });
          }
      }
  }