// ==UserScript==
// @name        Mint.com tag display
// @namespace   http://warkmilson.com
// @description Show tags in the "transactions" listing on Mint.com.
// @include     https://wwws.mint.com/transaction.event*
// @version     0.1.0
// @grant       none
// @noframes
// ==/UserScript==
//

(function() {
  var transIdToTags = {};
  function ingestTransactions(transactions) {
    transactions.forEach(function(trans) {
      transIdToTags[trans['id']] = trans['labels'].map(function(label) { return label['name']; }).join(', ');
    });
  }

  (function(open) {
    XMLHttpRequest.prototype.open = function() {
      this.addEventListener("readystatechange", function() {
        if(this.readyState === 4 && this.responseURL.match('getJsonData.xevent')) {
          var json = window.JSON.parse(this.responseText);
          json['set'].forEach(function(item) {
            // TODO also observe updates to single transactions
            if(item['id'] === 'transactions') {
              ingestTransactions(item['data']);
            }
          });
        }
      }, false);
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

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
