// ==UserScript==
// @name        Mint.com tag display
// @namespace   http://warkmilson.com
// @description Show tags in the "transactions" listing on Mint.com.
// @include     https://*.mint.com/*
// @version     0.1.0
// @grant       none
// @noframes
// ==/UserScript==
//

(function() {
  var transIdToTags = {};
  var tagIdToName = {};
  function ingestTransactions(transactions) {
    transactions.forEach(function(trans) {
      transIdToTags[trans['id']] = trans['labels'].map(function(label) { return label['name']; }).join(', ');
      trans['labels'].forEach(function(label) {
        tagIdToName[label['id']] = label['name'];
      });
    });
  }

  (function(open) {
    XMLHttpRequest.prototype.open = function() {
      // instrument all XHR responses to intercept transaction listing
      this.addEventListener("readystatechange", function() {
        if(this.readyState === 4 && this.responseURL.match('getJsonData.xevent')) {
          var json = window.JSON.parse(this.responseText);
          json['set'].forEach(function(item) {
            if(item['id'] === 'transactions') {
              ingestTransactions(item['data']);
            }
          });
        }
      }, false);

      // instrument all XHR requests to intercept updates to transactions
      if(arguments[0].match(/post/i) && arguments[1].match('updateTransaction.xevent')) {
        var self = this, send = this.send;
        this.send = function() {
          var data = arguments[0];
          var transIds = [];
          var tagNames = [];
          data.split('&').forEach(function(pair) {
            var kv = pair.split('='), key = window.decodeURIComponent(kv[0]), val = window.decodeURIComponent(kv[1]);

            var tagId = key.match(/tag(\d+)/);
            if(tagId !== null && val === '2') {
              tagNames.push(tagIdToName[tagId[1]]);
            }

            // value is '1234:0' for a single transaction, '1234:0,2345:0' for multiple
            if(key === 'txnId') {
              transIds = val.split(',').map(function(tId) { return tId.split(':')[0]; });
            }
          });

          transIds.forEach(function(tId) {
            transIdToTags[tId] = tagNames.join(', ') || undefined;
          });

          send.apply(self, arguments);
        };
      }

      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  // add tags to the transactions table
  function updateTable() {
    var trs = jQuery('tbody#transaction-list-body tr');
    trs.each(function(_, tr) {
      var $td = jQuery(tr).find('td.cat');
      var transId = jQuery(tr).attr('id').split('-')[1];
      if($td.find('.gm-tags').length === 0) {
        // TODO separate span for each tag
        $td.append('<span class="gm-tags" style="background: #0AC775; color: white; font-size: 10px; display: inline-block; margin-left: 4px; padding: 0 2px;"></span>');
      }
      $td.find('.gm-tags').text(transIdToTags[transId]);
    });
  }

  // TODO this is disgusting; use a MutationObserver for the transactions table
  setInterval(updateTable, 2000);
})();
