(function() {

  var files;
  var stream;
  var runId;
  var browserId;
  var socket;

  var thisFile = 'ci-support.js';
  var thisScript = document.querySelector('script[src$="' + thisFile + '"]');
  var base = thisScript.src.substring(0, thisScript.src.lastIndexOf('/')+1);

  var tools = {
    'mocha-tdd': [
      base + 'mocha/mocha.css',
      base + 'mocha/mocha.js',
      base + 'mocha-htmltest.js',
      function() {
        var div = document.createElement('div');
        div.id = 'mocha';
        document.body.appendChild(div);
        mocha.setup({ui: 'tdd', slow: 1000, timeout: 10000, htmlbase: ''});      
      }
    ],
    'chai': [
      base + 'chai/chai.js'      
    ]
  };

  function addFile() {
    var file = files.shift();
    if (Object.prototype.toString.call(file) == '[object Function]') {
      file();
      nextFile();
    }
    else if (file.slice(-3) == '.js') {
      var script = document.createElement('script');
      script.src = file;
      script.onload = nextFile;
      script.onerror = function() { console.error('Could not load ' + script.src); };
      document.head.appendChild(script);
    } else if (file.slice(-4) == '.css') {
      var sheet = document.createElement('link');
      sheet.rel = 'stylesheet';
      sheet.href = file;
      document.head.appendChild(sheet);
      nextFile();
    }
  }

  function nextFile() {
    if (files.length) {
      addFile();
    } else {
      startMocha();
    }
  }

  function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for (var i=0;i<vars.length;i++) {
      var pair = vars[i].split("=");
      if (pair[0] == variable) { 
        return pair[1]; 
      }
    }
    return(false);
  }

  function runTests(setup) {
    stream = getQueryVariable('stream');
    runId = getQueryVariable('run');
    browserId = getQueryVariable('browser');
    files = [];

    if (stream) {
      files.push('http://localhost:' + stream + '/socket.io/socket.io.js');
    }

    if (typeof setup == 'string') {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', setup);
      xhr.responseType = 'application/json';
      xhr.send();
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          setupTests(JSON.parse(xhr.response));
        }
      };
    } else {
      setupTests(setup);
    }
  }

  function setupTests(setup) {
    if (setup.tools) {
      setup.tools.forEach(function(tool) {
        if (tools[tool]) {
          files = files.concat(tools[tool]);
        } else {
          console.error('Unknown tool: ' + tool);
        }
      });
    }
    if (setup.dependencies) {
      files = files.concat(setup.dependencies.map(function(d) {
        return '../' + d;
      }));
    }
    files = files.concat(setup.tests);
    nextFile();    
  }

  function startMocha() {
    var runner = mocha.run();

    if (stream) {
      socket = io('http://localhost:' + stream);
    }
    var emitEvent = function(event, data) {
      if (socket) {
        socket.emit('mocha event', {event: event, browser: browserId, run: runId, data: data});
      }
    };

    var failedTests = [];
    runner.on('end', function() {
      window.mochaResults = runner.stats;
      window.mochaResults.reports = failedTests;
      emitEvent('end', window.mochaResults);
    });

    runner.on('fail', function(test, err) {
      var flattenTitles = function(test) {
        var titles = [];
        while (test.parent.title) {
          titles.push(test.parent.title);
          test = test.parent;
        }
        return titles.reverse();
      };
      var failure = {
        name: test.title,
        result: false,
        message: err.message,
        stack: err.stack,
        titles: flattenTitles(test) 
      };
      failedTests.push(failure);
      emitEvent('fail', failure);
    });

    // Other events
    if (socket) {
      ['start', 'suite', 'suite end', 'test', 'test end', 'hook', 'hook end', 'pass'].forEach(function(event) {
        runner.on(event, function(data) {
          var cache = {};
          emitEvent(event, JSON.stringify(data, function(key, value) {
            if (!cache[value]) {
              cache[value] = true;
              return value;
            }
          }));
        });
      });

      socket.on('webdriver result', function(result) {
        var cmd = wdQueue.shift();
        cmd.cb(result.error, result.results);
        if (wdQueue.length) {
          sendWdCommand();
        }
      });
    }
  }

  var wdQueue = [];
  window.webdriverCommand = function(args, cb) {
    if (socket) {
      wdQueue.push({args: args, cb: cb});
      if (wdQueue.length == 1) {
        sendWdCommand();
      }
    } else {
      cb('Not connected to ci-runner, cannot run Webdriver commands.');
    }
  };
  function sendWdCommand() {
    socket.emit('webdriver command', {browser: browserId, run: runId, args: wdQueue[0].args});
  }

  window.runTests = runTests;
})();