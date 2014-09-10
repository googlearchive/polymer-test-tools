/*
 * Copyright 2013 The Polymer Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function() {
  // if standalone
  if (window.top === window) {
    // if standalone
    var failed = false;
    window.done = function() {
      window.onerror = null;
      if (!failed) {
        var d = document.createElement('pre');
        d.style.cssText = 'padding: 6px; background-color: lightgreen; position: absolute; bottom:0; right:10px;';
        d.textContent = 'Passed';
        document.body.appendChild(d);
      }
    };
    window.onerror = function(x) {
      failed = true;
      var d = document.createElement('pre');
      d.style.cssText = 'padding: 6px; background-color: #FFE0E0; position: absolute; bottom:0; right:10px;';
      d.textContent = 'FAILED: ' + x;
      document.body.appendChild(d);
    };
  } else
  // if part of a test suite
  {
    window.done = function(err) {
      window.onerror = null;
      if (err) {
        console.error(err);
        parent.postMessage({error: err}, '*');
      } else {
        parent.postMessage('ok', '*');
      }
    };
    
    window.onerror = function(err) {
      console.error(err);
      parent.postMessage({error: err}, '*');
    };
  }

  function getXPath(element) {
    var xpath = '';
    element = unwrap(element);
    for ( ; element && element.nodeType == 1; element = element.parentNode ) {
      var id = element.parentNode && element.parentNode.children && Array.prototype.slice.apply(element.parentNode.children).filter(function(e) {
        return e.tagName == element.tagName;
      }).indexOf(element) + 1;
      id = id > 1 ? ('[' + id + ']') : '';
      xpath = '/' + element.tagName.toLowerCase() + id + xpath;
    }
    console.log('xpath: ' + xpath);
    return xpath;
  }
  window.getXPath = getXPath;

  var wdQueue = [];
  var wdCurrentCmd;
  window.webdriverCommand = function(args, cb, next) {
    for (var i=0; i<args.length; i++) {
      if (args[i] instanceof Element) {
        args[i] = {xpath: getXPath(args[i])};
      }
    }
    console.log('webdriver command: ', args);
    wdQueue.push({args: args, cb: function(err) {
      if (err && next) {
        next(err);
      } else {
        cb(err);
      }
    }});
    if (wdQueue.length == 1) {
      sendWdCommand();
    }
  };
  function sendWdCommand() {
    if (parent == window) {
      throw 'WebDriver commands can only be sent when being run in mocha-htmltest iframe.';
    }
    wdCurrentCmd = wdQueue.shift();
    parent.postMessage({webdriverCommand: wdCurrentCmd.args}, '*');
  }
  window.addEventListener('message', function(event) {
    wdCurrentCmd.cb(event.data.error, event.data.results);
    if (wdQueue.length) {
      sendWdCommand();
    }
  }, false);
  window.requiresWebdriver = function(fn, cb) {
    if ((parent != window ) && (parent.location.search.indexOf('stream') >= 0)) {
      fn();
    } else {
      cb();
    }
  };

  window.asyncSeries = function(series, callback, forwardExceptions) {
    series = series.slice();
    var next = function(err) {
      if (err) {
        if (callback) {
          callback(err);
        }
      } else {
        var f = series.shift();
        if (f) {
          if (!forwardExceptions) {
            f(next);
          } else {
            try {
              f(next);
            } catch(e) {
              if (callback) {
                callback(e);
              }
            }
          }
        } else {
          if (callback) {
            callback();
          }
        }
      }
    };
    next();
  };

  window.waitFor = function(fn, next, intervalOrMutationEl, timeout, timeoutTime) {
    timeoutTime = timeoutTime || Date.now() + (timeout || 1000);
    intervalOrMutationEl = intervalOrMutationEl || 32;
    try {
      fn(); 
    } catch (e) { 
      if (Date.now() > timeoutTime) {
        throw e;
      } else {
        if (isNaN(intervalOrMutationEl)) {
          intervalOrMutationEl.onMutation(intervalOrMutationEl, function() {
            waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
          });
        } else {
          setTimeout(function() {
            waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
          }, intervalOrMutationEl);
        }
        return;
      }
    }
    next();
  };
})();
