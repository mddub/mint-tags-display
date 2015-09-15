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

  function maybeIngestTransactionsList(response) {
    var json = window.JSON.parse(response);
    json['set'].forEach(function(item) {
      if(item['id'] === 'transactions') {
        item['data'].forEach(function(trans) {
          transIdToTags[trans['id']] = trans['labels'].map(function(label) { return label['name']; }).join(', ');
          trans['labels'].forEach(function(label) {
            tagIdToName[label['id']] = label['name'];
          });
        });
      }
    });
  }

  function maybeIngestTagsList(response) {
    var json = window.JSON.parse(response);
    if(json['bundleResponseSent']) {
      jQuery.each(json['response'], function(key, val) {
        if(val['responseType'] === 'MintTransactionService_getTagsByFrequency') {
          val['response'].forEach(function(tagData) {
            tagIdToName[tagData['id']] = tagData['name'];
          });
        }
      });
    }
  }

  function interceptTransactionEdit(data) {
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
      var $row = jQuery('#transaction-' + tId);
      if($row.length > 0) {
        updateRow(jQuery('#transaction-' + tId));
      }
    });
  }

  // update a transaction row using cached tag data
  function updateRow(tr) {
    var $td = jQuery(tr).find('td.cat');
    // tr will have id like 'transaction-12345'
    var transId = jQuery(tr).attr('id').split('-')[1];
    if(transIdToTags[transId]) {
      if($td.find('.gm-tags').length === 0) {
        $td.append('<span class="gm-tags" style="background: #0AC775; color: white; font-size: 10px; display: inline-block; margin-left: 4px; padding: 0 2px;"></span>');
      }
      $td.find('.gm-tags').text(transIdToTags[transId]);
    } else {
      $td.find('.gm-tags').remove();
    }
  }

  (function(open) {
    XMLHttpRequest.prototype.open = function() {
      // instrument all XHR responses to intercept the ones which may contain transaction listing or tag listing
      this.addEventListener("readystatechange", function() {
        if(this.readyState === 4 && this.responseURL.match('getJsonData.xevent')) {
          maybeIngestTransactionsList(this.responseText);
        } else if(this.readyState === 4 && this.responseURL.match('bundledServiceController.xevent')) {
          maybeIngestTagsList(this.responseText);
        }
      }, false);

      // instrument all XHR requests to intercept edits to transactions
      if(arguments[0].match(/post/i) && arguments[1].match('updateTransaction.xevent')) {
        var self = this, send = this.send;
        this.send = function() {
          interceptTransactionEdit(arguments[0]);
          send.apply(self, arguments);
        };
      }

      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  // observe changes to the content of the transactions table
  (function observeDOM() {
    // ...only after the transactions table has appeared
    var target = document.querySelector('#transaction-list-body');
    if(target === null) {
      setTimeout(observeDOM, 500);
      return;
    }

    new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        // Mutation events seem to be triggered only for the text in the merchant column of a transaction row.
        var row = jQuery(mutation.target).parents('tr').first();
        updateRow(row);
      });
    }).observe(
      target,
      {subtree: true, characterData: true}
    );
  })();

})();
