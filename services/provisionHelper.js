 var api = {
     _keyStr: '0BCD1EF2GH3JK4LM5NP6QR7ST8VW9XYZ',

     encode: function(n) {
         var output = '';

         while (n > 0) {
             var p = n % 32;
             n = Math.floor(n / 32);
             output = api._keyStr.charAt(p) + output;
         }

         if (output.length < 6) {
             var half = Math.floor(output.length / 2);

             return output.substr(0, half) + '-' + output.substr(half);
         } else {
             if (output.length < 10) {
                 output = '00000'.substr(0, 10 - output.length) + output;
             }
             return output.substr(0, 5) + '-' + output.substr(5);
         }
     },

     genCheckDigits: function(n) {
         var digits = n.toString();
         var cs = 0;
         var xs = 0;
         for (var i = 0; i < digits.length; i++) {
             var d = parseInt(digits.charAt(i));
             cs += d;
             xs ^= d;
         }
         return (cs % 10).toString() + (xs % 10).toString();
     },

     encodeMac: function(input) {
         var clean = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
         var n = parseInt(clean, 16);
         return api.encode(n) + '-' + api.genCheckDigits(n);
     },

     decode: function(input) {
         input = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
         var n = 0;
         for (var i = 0; i < input.length - 2; i++) {
             n = n * 32;
             n = n + api._keyStr.indexOf(input.charAt(i));
         }

         return n;
     },

     validate: function(input) {
         if (input) {
             try {
                 if (input.length != 14) {
                     return false;
                 }
                 var clean = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
                 if (clean.length != 12) {
                     return false;
                 }
                 var cd1 = clean.substr(clean.length - 2, 2);
                 var cd2 = api.genCheckDigits(api.decode(input));
                 return (cd1 == cd2);
             } catch (err) {
                 console.error(err);
                 return false;
             }
         } else {
             return false;
         }
     },

     validateTenant: function(input) {
         if (input) {
             try {
                 if (input.length != 9) {
                     return false;
                 }
                 var clean = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
                 if (clean.length != 7) {
                     return false;
                 }
                 var cd1 = clean.substr(clean.length - 2, 2);
                 var cd2 = api.genCheckDigits(api.decode(input));
                 return (cd1 == cd2);
             } catch (err) {
                 console.error(err);
                 return false;
             }
         } else {
             return false;
         }
     },

     encodeTenant: function(t) {
         var n = (t * 1415) ^ 7654321;

         return api.encode(n) + '-' + api.genCheckDigits(n);
     },

     decodeTenant: function(tenant) {
         var n = api.decode(tenant);
         return Math.floor((n ^ 7654321) / 1415);
     }
 }

 module.exports = api;