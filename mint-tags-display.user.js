// ==UserScript==
// @name        Mint.com tags display
// @include     https://*.mint.com/*
// @include     https://mint.intuit.com/*
// @description Show tags in the transactions listing on Mint.com.
// @namespace   com.warkmilson.mint.js
// @author      Mark Wilson
// @version     1.1.0
// @homepage    https://github.com/mddub/mint-tags-display
// @updateURL   https://github.com/mddub/mint-tags-display/raw/master/mint-tags-display.user.js
// @downloadURL https://github.com/mddub/mint-tags-display/raw/master/mint-tags-display.user.js
// @grant       none
// @noframes
// ==/UserScript==
//

(function() {
  var TAG_STYLE = 'font-size: 10px; display: inline-block;';
  var SINGLE_TAG_STYLE = 'margin-left: 4px; padding: 0 2px;';
  var TAG_COLORS = [
    // source: http://colorbrewer2.org/#type=qualitative&scheme=Paired&n=12
    // background, foreground
    ['#a6cee3', 'black'],
    ['#b2df8a', 'black'],
    ['#fb9a99', 'black'],
    ['#fdbf6f', 'black'],
    ['#cab2d6', 'black'],
    ['#ffff99', 'black'],
    ['#1f78b4', 'white'],
    ['#33a02c', 'white'],
    ['#e31a1c', 'white'],
    ['#ff7f00', 'white'],
    ['#6a3d9a', 'white'],
    ['#b15928', 'white']
  ];

  var tagsByFrequency;

  var transIdToTags = {};
  var tagIdToName = {};

  function maybeIngestTransactionsList(response) {
    var json = window.JSON.parse(response);
    json['set'].forEach(function(item) {
      if(item['id'] === 'transactions') {
        item['data'].forEach(function(trans) {
          transIdToTags[trans['id']] = trans['labels'].map(function(label) { return label['name']; });
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

          tagsByFrequency = val['response'].sort(function(a, b) {
            return b['transactionCount'] - a['transactionCount'];
          }).map(function(tagData) {
            return tagData['name'];
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
      transIdToTags[tId] = tagNames;
      if(jQuery('#transaction-' + tId).length > 0) {
        updateRow('transaction-' + tId);
      }
    });
  }

  // update a transaction row using cached tag data
  function updateRow(rowId) {
    var $td = jQuery('#' + rowId).find('td.cat');
    var transId = rowId.split('-')[1];
    if(transIdToTags[transId] && transIdToTags[transId].length) {
      if($td.find('.gm-tags').length === 0) {
        $td.append('<span class="gm-tags" style="' + TAG_STYLE + '"></span>');
      }

      // HTML for each tag, unique color for each tag
      var tagsHTML = transIdToTags[transId].map(function(tag) {
        return '<span class="gm-tag" style="' + tagStyleLookup(tag) + '; ' + SINGLE_TAG_STYLE + '">' + tag + '</span>';
      }).join('');

      $td.find('.gm-tags').html(tagsHTML);

    } else {
      $td.find('.gm-tags').remove();
    }
  }

  (function(open) {
    XMLHttpRequest.prototype.open = function() {
      // Firefox and Chrome support this.responseURL, but Safari does not, so we need to store it
      var requestURL_ = arguments[1];

      // instrument all XHR responses to intercept the ones which may contain transaction listing or tag listing
      this.addEventListener("readystatechange", function() {
        if(this.readyState === 4 && requestURL_.match('getJsonData.xevent')) {
          maybeIngestTransactionsList(this.responseText);
        } else if(this.readyState === 4 && requestURL_.match('bundledServiceController.xevent')) {
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

  function observeDOM(target) {
    var observer;

    function handleMutations(mutations) {
      var rowIdsToUpdate = {};
      mutations.forEach(function(mutation) {
        var $target = jQuery(mutation.target);
        var $tr = jQuery(mutation.target).parents('tr').first();
        if(!$target.hasClass('gm-tags') && $tr.length && $tr.attr('id') && $tr.attr('id').indexOf('transaction-') === 0) {
          // when the transactions list changes, there will be multiple mutations per row (date column, amount column, etc.)
          rowIdsToUpdate[$tr.attr('id')] = true;
        }
      });

      observer.disconnect();
      for(var rowId in rowIdsToUpdate) {
        updateRow(rowId);
      }
      observe();
    }

    function observe() {
      observer = new MutationObserver(handleMutations);
      observer.observe(
        target,
        {subtree: true, childList: true, characterData: true}
      );
    }

    observe();
  }

  (function waitForTable() {
    var target = document.querySelector('#transaction-list-body');
    if(target === null) {
      setTimeout(waitForTable, 500);
      return;
    }

    // populate the table with tags after it first loads
    jQuery(target).find('tr').each(function(_, row) {
      updateRow(row.id);
    });

    observeDOM(target);
  })();

  function tagStyleLookup(tag) {
    var index = tagsByFrequency.indexOf(tag);
    var colors = TAG_COLORS[index % TAG_COLORS.length];
    return 'background-color: ' + colors[0] + '; color: ' + colors[1] + ';';
  }

})();
