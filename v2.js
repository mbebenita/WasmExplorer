/**
 * You must include the dependency on 'ngMaterial' 
 */
angular.module('WasmExplorerApp', ['ngMaterial']).controller('WasmExplorerAppCtrl', WasmExplorerAppCtrl);

function WasmExplorerAppCtrl($scope, $timeout, $mdSidenav) {
  this._scope = $scope;
  this._timeout = $timeout;
  this._mdSidenav = $mdSidenav;
  
  this.sourceEditor = null;
  this.wastEditor = null;
  this.assemblyEditor = null;
  this.consoleEditor = null;


  this.consoleVisible = true;

  this.hideProgress();

  // this.createBanner(); 
  this.createSourceEditor();
  this.createWastEditor();
  this.createAssemblyEditor();
  this.createConsoleEditor();
  this.writeWelcomeMessage();
  this.resizeEditors();

  this.autoCompile = true;
  this.examples = Object.getOwnPropertyNames(cppExamples);
  this.selectedExample;

  this.dialects = ["C89", "C99", "C++98", "C++11", "C++14", "C++1z"];
  this.selectedDialect = "C++11";

  this.optimizationLevels = ["0", "1", "2", "3", "4", "s"];
  this.selectedOptimizationLevel = "s";

  this.fastMath = false;
  this.noInline = false;
  this.noRTTI = false;
  this.noExceptions = false;

  this.sharingLink = "";

  this.checkUrlParameters();
}

var p = WasmExplorerAppCtrl.prototype;

function getUrlParameters() {
  var url = window.location.search.substring(1);
  url = url.replace(/\/$/, ""); // Replace / at the end that gets inserted by browsers.
  var params = {};
  url.split('&').forEach(function (s) {
    var t = s.split('=');
    params[t[0]] = decodeURIComponent(t[1]);
  });
  return params;
};

p.checkUrlParameters = function checkUrlParameters() {
  var parameters = getUrlParameters();
  if (parameters["state"]) {
    var state = JSON.parse(parameters["state"]);
    this.sourceEditor.setValue(state.source, -1);
    this.wastEditor.setValue(state.wast, -1);

    this.selectedExample = state.options.selectedExample;
    this.selectedDialect = state.options.selectedDialect;
    this.selectedOptimizationLevel = state.options.selectedOptimizationLevel;
    this.fastMath = state.options.fastMath;
    this.noInline = state.options.noInline;
    this.noRTTI = state.options.noRTTI;
    this.noExceptions = state.options.noExceptions;
  }
};

p.changeDialect = function changeDialect() {
  this.change();
};
p.getSelectedDialectText = function() {
  if (this.selectedDialect !== undefined) {
    return this.selectedDialect;
  } else {
    return "Dialects";
  }
};

p.changeOptimizationLevel = function changeOptimizationLevel() {
  this.change();
};
p.getSelectedOptimizationLevelText = function() {
  if (this.selectedOptimizationLevel !== undefined) {
    return this.selectedOptimizationLevel;
  } else {
    return "Optimization Levels";
  }
};

p.changeExample = function changeExample() {
  this.sourceEditor.setValue(cppExamples[this.selectedExample], -1);
  this.change();
};
p.getSelectedExampleText = function() {
  if (this.selectedExample !== undefined) {
    return this.selectedExample;
  } else {
    return "Examples";
  }
};

p.changeCompilerOption = function changeCompilerOption() {
  this.change();
};
p.change = function change() {
  if (this.autoCompile) {
    this.compile();
  }
};
p.toggleMenu = function toggleMenu() {
  this._mdSidenav("left").toggle();
};
p.toggleConsole = function toggleConsole() {
  this.consoleVisible = !this.consoleVisible;
};
p.compile = function compile() {
  var self = this;
  var options = [];
  var source = this.sourceEditor.getValue();
  var inputString = encodeURIComponent(source).replace('%20', '+');
  var actionString = this.selectedDialect.toLowerCase().indexOf("c++") >= 0 ? "cpp2wast" : "c2wast";

  // Gather Options
  var options = [
    "-std=" + this.selectedDialect.toLowerCase(),
    "-O" + this.selectedOptimizationLevel
  ];
  if (this.fastMath) options.push("-ffast-math");
  if (this.noInline) options.push("-fno-inline");
  if (this.noRTTI) options.push("-fno-rtti");
  if (this.noExceptions) options.push("-fno-exceptions");

  var optionsString = encodeURIComponent(options.join(" "));
  self.sourceEditor.getSession().clearAnnotations();
  self.sendRequest("input=" + inputString + "&action=" + actionString + "&options=" + optionsString, function () {
    var wast = this.responseText;

    // Parse and annotate errors if compilation fails.
    if (wast.indexOf("(module") !== 0) {
      var re = /^.*?:(\d+?):(\d+?):(.*)$/gm; 
      var m;
      var annotations = [];
      while ((m = re.exec(wast)) !== null) {
        if (m.index === re.lastIndex) {
            re.lastIndex++;
        }
        var line = parseInt(m[1]) - 1;
        var column = parseInt(m[2]) - 1;
        var message = m[3];
        annotations.push({
          row: line,
          column: column,
          text: message,
          type: message.indexOf("error") >= 0 ? "error" : "warning" // also warning and information
        });
      }
      self.sourceEditor.getSession().setAnnotations(annotations);
      self.appendConsole(wast);
      return;
    }

    self.wastEditor.setValue(wast, -1);
    self.assemble();
  }, "Compiling C/C++ to .wast");
};
p.share = function share() {
  var self = this;
  var url = location.protocol + '//' + location.host + location.pathname;
  var state = {
    source: self.sourceEditor.getValue(),
    wast: self.wastEditor.getValue(),
    options: {
      selectedExample: self.selectedExample,
      selectedDialect: self.selectedDialect,
      selectedOptimizationLevel: self.selectedOptimizationLevel,
      fastMath: self.fastMath,
      noInline: self.noInline,
      noRTTI: self.noRTTI,
      noExceptions: self.noExceptions
    }
  };
  url += "?state=" + encodeURIComponent(JSON.stringify(state));
  shortenUrl(url, function (url) {
    self.sharingLink = url;
    self._scope.$apply();
    // $('#shareURL').val(url).select();
  });
};
p.assemble = function assemble() {
  var self = this;
  var wast = self.wastEditor.getValue();
  if (wast.indexOf("module") < 0) {
    self.appendConsole("Doesn't look like a wasm module.");
    document.getElementById('downloadLink').href = '';
    return;
  }
  if (typeof capstone === "undefined") {
    self.lazyLoad("lib/capstone.x86.min.js", go);
  } else {
    go();
  }
  function go() {
    self.wastEditor.getSession().clearAnnotations();
    var inputString = encodeURIComponent(wast).replace('%20', '+');
    var actionString = "wast2assembly";
    self.sendRequest("input=" + inputString + "&action=" + actionString, function () {
      var json = JSON.parse(this.responseText);
      if (typeof json === "string") {
        var parseError = "wasm text error: parsing wasm text at ";
        if (json.indexOf(parseError) == 0) {
          var location = json.substring(parseError.length).split(":");
          var line = Number(location[0]) - 1;
          var column = Number(location[1]) - 1;
          var Range = ace.require('ace/range').Range;
          var mark = self.wastEditor.getSession().addMarker(new Range(line, column, line, column + 1), "marked", "text", false);
          self.wastEditor.getSession().setAnnotations([{
            row: line,
            column: column,
            text: json,
            type: "error" // also warning and information
          }]);
        }
        self.appendConsole(json);
        return;
      }
      var s = "";
      var cs = new capstone.Cs(capstone.ARCH_X86, capstone.MODE_64);
      for (var i = 0; i < json.regions.length; i++) {
        var region = json.regions[i];
        s += region.name + ":\n\n";
        var csBuffer = decodeRestrictedBase64ToBytes(region.bytes);
        var instructions = cs.disasm(csBuffer, region.entry);
        instructions.forEach(function(instr) {
          s += padRight(instr.mnemonic + " " + instr.op_str, 38, " ");
          s += "; " + toAddress(instr.address) + " " + toBytes(instr.bytes) + "\n";
        });
        s += "\n";
      }
      self.assemblyEditor.getSession().setValue(s, 1);
      cs.delete();
      self.buildDownload();
    }, "Compiling .wast to x86");

    function padRight(s, n, c) {
      while (s.length < n) {
        s = s + c;
      }
      return s;
    }

    function padLeft(s, n, c) {
      while (s.length < n) {
        s = c + s;
      }
      return s;
    }

    function toAddress(n) {
      var s = n.toString(16);
      while (s.length < 6) {
        s = "0" + s;
      }
      return "0x" + s;
    }

    function toBytes(a) {
      return a.map(function (x) { return padLeft(Number(x).toString(16), 2, "0"); }).join(" ");
    }
  }
}
p.buildDownload = function() {
  document.getElementById('downloadLink').href = '';
  var wast = this.wastEditor.getValue();
  if (!/^\s*\(module\b/.test(wast)) {
    return; // Sanity check
  }
  this.sendRequest("input=" + encodeURIComponent(wast).replace('%20', '+') + "&action=wast2wasm", function () {
    var wasm = this.responseText;
    if (wasm.indexOf("WASM binary data") < 0) {
      console.log('Error during WASM compilation: ' + wasm);
      return;
    }
    document.getElementById('downloadLink').href = "data:;base64," + wasm.split('\n')[1];
  }, "Compiling .wast to .wasm");
}
p.download = function() {
  if (document.getElementById('downloadLink').href != document.location) {
    document.getElementById("downloadLink").click();
  }
};
p.showProgress = function (message) {
  if (message) {
    this.appendConsole(message);
  }
  this.progressMode = "indeterminate";
};
p.hideProgress = function () {
  this.progressMode = "determinate";
};
p.sendRequest = function sendRequest(command, cb, message) {
  var self = this;
  var xhr = new XMLHttpRequest();
  xhr.addEventListener("load", function () {
    self.hideProgress();
    self._scope.$apply();
    cb.call(this);
  });
  xhr.open("POST", "//areweflashyet.com/tmp/wasm/service.php", true);
  xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded")
  xhr.send(command);
  self.showProgress(message);
};

function setDefaultEditorSettings(editor, options) {
  editor.setTheme("ace/theme/github");
  editor.setFontSize(14);
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true
  });
  if (options) {
    editor.setOptions(options);
  }
  editor.renderer.setScrollMargin(10, 10);
}

p.lazyLoad = function(s, cb) {
  var self = this;
  self.showProgress("Loading: " + s);
  var d = window.document;
  var b = d.body;
  var e = d.createElement("script");
  e.async = true;
  e.src = s;
  b.appendChild(e);
  e.onload = function () {
    self.hideProgress();
    self._scope.$apply();
    cb.call(this);
  }
}

p.createBanner = function() {
  function resize() {
    var pattern = Trianglify({
      height: 70,
      width: window.innerWidth,
      cell_size: 40 + Math.random() * 30
    });
    pattern.canvas(document.getElementById('banner'));  
  }
  resize();
  window.addEventListener("resize", resizeThrottler, false);
  var resizeTimeout;
  function resizeThrottler() {
    if (!resizeTimeout) {
      resizeTimeout = setTimeout(function() {
        resizeTimeout = null;
        actualResizeHandler();
      }, 66);
    }
  }
  var oldWidth = window.innerWidth;
  function actualResizeHandler() {
    if (oldWidth !== window.innerWidth) {
      resize();
    }
    oldWidth = window.innerWidth;
  }
};

p.resizeEditors = function() {
  window.addEventListener("resize", resizeThrottler, false);
  var resizeTimeout;
  function resizeThrottler() {
    if (!resizeTimeout) {
      resizeTimeout = setTimeout(function() {
        resizeTimeout = null;
        actualResizeHandler();
      }, 66);
    }
  }
  var oldWidth = window.innerWidth;
  function actualResizeHandler() {
    if (oldWidth !== window.innerWidth) {
      resize();
    }
    oldWidth = window.innerWidth;
  }

  var self = this;
  function resize() {
    var show = window.innerWidth > 600;
    self.sourceEditor.renderer.setShowGutter(show);
    self.wastEditor.renderer.setShowGutter(show);
    self.assemblyEditor.renderer.setShowGutter(show);
  }
  resize();
};
p.createSourceEditor = function() {
  var self = this;
  this.sourceEditor = ace.edit("sourceCodeContainer");
  this.sourceEditor.getSession().setMode("ace/mode/c_cpp");
  setDefaultEditorSettings(this.sourceEditor, {wrap: true});
  this.sourceEditor.commands.addCommand({
    name: 'compileCommand',
    bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
    exec: function(editor) {
      self.compile();
      self._scope.$apply();
    },
    readOnly: true
  });
}

p.createWastEditor = function() {
  var self = this;
  this.wastEditor = ace.edit("wastCodeContainer");
  setDefaultEditorSettings(this.wastEditor, {wrap: true});
  this.wastEditor.commands.addCommand({
    name: 'assembleCommand',
    bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
    exec: function(editor) {
      self.assemble();
      self._scope.$apply();
    },
    readOnly: true
  });
}

p.createAssemblyEditor = function() {
  this.assemblyEditor = ace.edit("assemblyCodeContainer");
  this.assemblyEditor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(this.assemblyEditor);
}

p.createConsoleEditor = function() {
  this.consoleEditor = ace.edit("consoleContainer");
  // this.consoleEditor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(this.consoleEditor, {
    wrap: false, 
    enableBasicAutocompletion: false,
    enableSnippets: false,
    enableLiveAutocompletion: false
  });
  this.consoleEditor.setTheme("ace/theme/monokai");
  // this.consoleEditor.renderer.setShowGutter(false);
}
p.appendConsole = function(s) {
  this.consoleEditor.insert(s + "\n");
};
p.writeWelcomeMessage = function() {
  this.appendConsole(`Welcome to the WebAssembly Explorer
===================================

Here you can translate C/C++ to WebAssembly, and then see the machine code generated by the browser.

For bugs, comments and suggestions see: http://mbebenita.github.io/WasmExplorer

`);
};

// URL Shortening

function googleJSClientLoaded() {
  gapi.client.setApiKey("AIzaSyDF8nSRXwQKWZct5Tr5wotbLF3O8SCvjZU");
  gapi.client.load('urlshortener', 'v1', function () {
    shortenUrl(googleJSClientLoaded.url, googleJSClientLoaded.done);
  });
}

function shortenUrl(url, done) {
  if (!window.gapi || !gapi.client) {
    googleJSClientLoaded.url = url;
    googleJSClientLoaded.done = done;
    // document.body.append('<script src="//apis.google.com/js/client.js?onload=googleJSClientLoaded">');
    var script   = document.createElement("script");
    script.type  = "text/javascript";
    script.src   = "//apis.google.com/js/client.js?onload=googleJSClientLoaded";
    document.body.appendChild(script);
    return;
  }
  var request = gapi.client.urlshortener.url.insert({
    resource: {
        longUrl: url
    }
  });
  request.then(function (resp) {
    var id = resp.result.id;
    done(id);
  }, function () {
    done(url);
  });
}
