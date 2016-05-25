/**
 * You must include the dependency on 'ngMaterial' 
 */
angular.module('WasmExplorerApp', ['ngMaterial']).controller('WasmExplorerAppCtrl', WasmExplorerAppCtrl);

function toAddress(n) {
  var s = n.toString(16);
  while (s.length < 6) {
    s = "0" + s;
  }
  return "0x" + s;
}

function match(re, text, group) {
  var m = text.match(re);
  if (m) {
    return m[group];
  }
}

var x86JumpInstructions = [
  "jmp", "ja", "jae", "jb", "jbe", "jc", "je", "jg", "jge", "jl", "jle", "jna", "jnae", 
  "jnb", "jnbe", "jnc", "jne", "jng", "jnge", "jnl", "jnle", "jno", "jnp", "jns", "jnz", 
  "jo", "jp", "jpe", "jpo", "js", "jz"
];

function isBranch(instr) {
  return x86JumpInstructions.indexOf(instr.mnemonic) >= 0;
}

function WasmExplorerAppCtrl($scope, $timeout, $mdSidenav) {
  this._scope = $scope;
  this._timeout = $timeout;
  this._mdSidenav = $mdSidenav;
  
  this.sourceEditor = null;
  this.wastEditor = null;
  this.assemblyEditor = null;
  this.assemblyEditorMarkers = [];
  this.assemblyInstructionsByAddress = {};
  this.consoleEditor = null;

  this.istructionDescription = null;
  this.llvmInstructionDescription = null;
  this.hideProgress();

  
  this.createSourceEditor();
  this.createWastEditor();
  this.createAssemblyEditor();
  this.createLLVMAssemblyEditor();
  this.createConsoleEditor();

  this.editors = [
    this.sourceEditor,
    this.wastEditor,
    this.assemblyEditor,
    this.llvmAssemblyEditor,
    this.consoleEditor
  ];

  this.writeWelcomeMessage();
  this.listenForResizeEvents();
  
  this.setSessionStorageDefaults();

  this.showLLVM = sessionStorage.getItem('showLLVM') === "true";
  this.showConsole = sessionStorage.getItem('showConsole') === "true";

  this.darkMode = sessionStorage.getItem('darkMode') === "true";
  this.showGutter = sessionStorage.getItem('showGutter') === "true";;
  this.changeEditor();

  this.autoCompile = sessionStorage.getItem('autoCompile') === "true";

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
  this.mobileVersion();
}

function getMobileOperatingSystem() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (userAgent.match(/iPad/i) || userAgent.match(/iPhone/i) || userAgent.match(/iPod/i)) {
    return 'iOS'
  } else if (userAgent.match(/Android/i)) {
    return 'Android';
  } else {
    return 'unknown';
  }
}

var p = WasmExplorerAppCtrl.prototype;

p.setSessionStorageDefaults = function() {
  if (sessionStorage.getItem('showGutter') == null) {
    sessionStorage.setItem('showGutter', true);
  }
  if (sessionStorage.getItem('showConsole') == null) {
    sessionStorage.setItem('showConsole', true);
  }
};

p.mobileVersion = function() {
  var kind = getMobileOperatingSystem();
  if (kind == "Android" || kind == "iOS") {
    var s = 2; // Scale
    var w = screen.width * s;
    var h = screen.height * s;
    document.body.style.width = w + "px";
    document.body.style.height = h + "px";

    var block = document.getElementById("blockOverlay");
    block.style.display = "block";
    block.style.height = (h - 128) + "px";
  }
};

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
p.changeEditor = function changeEditor() {
  sessionStorage.setItem('darkMode', this.darkMode);
  sessionStorage.setItem('showGutter', this.showGutter);
  var theme = this.darkMode ? "ace/theme/monokai" : "ace/theme/github";
  this.sourceEditor.setTheme(theme);
  this.wastEditor.setTheme(theme);
  this.assemblyEditor.setTheme(theme);
  this.llvmAssemblyEditor.setTheme(theme);

  var consoleTheme = this.darkMode ? "ace/theme/monokai" : "ace/theme/dawn";
  this.consoleEditor.setTheme(consoleTheme);
  var self = this;
  this.editors.forEach(function (editor) {
    editor.renderer.setShowGutter(self.showGutter);
  });
};
p.changeAutoCompile = function changeAutoCompile() {
  sessionStorage.setItem('autoCompile', this.autoCompile);
};
p.changeShowLLVM = function changeAutoCompile() {
  sessionStorage.setItem('showLLVM', this.showLLVM);
};
p.changeDialect = function changeDialect() {
  this.change();
};
p.changeTarget = function () {
  
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
p.toggleLLVM = function toggleLLVM() {
  this.showLLVM = !this.showLLVM;
  this.changeShowLLVM();
  this.changeCompilerOption();
  var self = this
  setTimeout(function () {
    self.resizeEditors();  
  }, 200);
};
p.toggleConsole = function toggleConsole() {
  this.showConsole = !this.showConsole;
  sessionStorage.setItem('showConsole', this.showConsole);
  var self = this
  setTimeout(function () {
    self.resizeEditors();  
  }, 200);
};
p.compile = function compile() {
  var self = this;
  var options = [];
  var source = this.sourceEditor.getValue();
  if (source.trim() == "") {
    return;
  }
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
  }, "Compiling C/C++ to Wast");

  if (this.showLLVM) {
    var actionString = this.selectedDialect.toLowerCase().indexOf("c++") >= 0 ? "cpp2x86" : "c2x86";
    self.sendRequest("input=" + inputString + "&action=" + actionString + "&options=" + optionsString, function () {
      var x86 = this.responseText;
      self.llvmAssemblyEditor.setValue(x86, -1);
    }, "Compiling C/C++ to LLVM Assembly");
  }
};
p.collaborate = function collaborate() {
  TogetherJS(this);
};
p.fileBug = function () {
  function getSelectedText(editor) {
    var text = editor.getSelectedText();
    if (text) {
      return text;
    }
    return editor.getValue();
  }

  var self = this;
  var comment = "";
  shortenUrl(this.getShareUrl(), function (url) {
    // comment += "WasmExplorer: " + url + "\n";

    comment += "C/C++:\n";
    comment += "===============================\n";
    comment += getSelectedText(self.sourceEditor);

    if (!self.showLLVM) {
      comment += "\n\nWast:\n";
      comment += "===============================\n";
      comment += getSelectedText(self.wastEditor);
    }

    comment += "\n\nFirefox:\n";
    comment += "===============================\n";
    comment += getSelectedText(self.assemblyEditor);

    if (self.showLLVM) {
      comment += "\n\nLLVM:\n";
      comment += "===============================\n";
      comment += getSelectedText(self.llvmAssemblyEditor);
    }

    window.open("https://bugzilla.mozilla.org/enter_bug.cgi?product=Core&component=JavaScript%20Engine%3A%20JIT&assigned_to=sunfish&short_desc=&comment=" + encodeURIComponent(comment));
  });  
};
p.getShareUrl = function () {
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
  return url;
};
p.share = function share() {
  var self = this;
  shortenUrl(this.getShareUrl(), function (url) {
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
      var annotations = [];

      self.assemblyInstructionsByAddress = Object.create(null);
      for (var i = 0; i < json.regions.length; i++) {
        var region = json.regions[i];
        s += region.name + ":\n";
        var csBuffer = decodeRestrictedBase64ToBytes(region.bytes);
        var instructions = cs.disasm(csBuffer, region.entry);
        var basicBlocks = {};
        instructions.forEach(function(instr, i) {
          self.assemblyInstructionsByAddress[instr.address] = instr;
          if (isBranch(instr)) {
            var targetAddress = parseInt(instr.op_str);
            if (!basicBlocks[targetAddress]) {
              basicBlocks[targetAddress] = [];
            }
            basicBlocks[targetAddress].push(instr.address);
            if (i + 1 < instructions.length) {
              basicBlocks[instructions[i + 1].address] = [];
            }
          }
        });
        instructions.forEach(function(instr) {
          if (basicBlocks[instr.address]) {
            s += " " + padRight(toAddress(instr.address) + ":", 39, " ");
            if (basicBlocks[instr.address].length > 0) {
              s += "; " + toAddress(instr.address) + " from: [" + basicBlocks[instr.address].map(toAddress).join(", ") + "]";
            }
            s += "\n";
          }
          s += "  " + padRight(instr.mnemonic + " " + instr.op_str, 38, " ");
          s += "; " + toAddress(instr.address) + " " + toBytes(instr.bytes) + "\n";
        });
        s += "\n";
      }
      self.assemblyEditor.getSession().setValue(s, 1);
      self.assemblyEditor.getSession().setAnnotations(annotations);
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
  editor.setFontSize(14);
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.setShowPrintMargin(false);
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
  this.editors.forEach(function (editor) {
    editor.resize();
  });
  // var show = this.showGutter || window.innerWidth > 600;
  // this.sourceEditor.renderer.setShowGutter(show);
  // this.wastEditor.renderer.setShowGutter(show);
  // this.assemblyEditor.renderer.setShowGutter(show);
};

p.listenForResizeEvents = function() {
  window.addEventListener("resize", resizeThrottler, false);
  var resizeTimeout;
  var self = this;
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
      self.resizeEditors();
    }
    oldWidth = window.innerWidth;
  }
  self.resizeEditors();
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

p.createLLVMAssemblyEditor = function() {
  this.llvmAssemblyEditor = ace.edit("llvmAssemblyCodeContainer");
  this.llvmAssemblyEditor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(this.llvmAssemblyEditor);
  this.llvmAssemblyEditor.renderer.setOption('showLineNumbers', false);
  var self = this;
  this.llvmAssemblyEditor.getSession().selection.on('changeCursor', function(e) {
    self.annotateLLVMAssemblyEditor();
  });
};
p.annotateLLVMAssemblyEditor = function() {
  var self = this;
  var editor = this.llvmAssemblyEditor;
  var line = editor.getSelectionRange().start.row;
  var text = editor.session.getLine(line);
  
  // Descriptions
  this.llvmInstructionDescription = null;
  var mnemonic = match(/\s*(\w*)/, text, 1);
  var description = x86Reference[mnemonic.toUpperCase()];
  if (description) {
    this.llvmInstructionDescription = {
      name: mnemonic.toLowerCase(), 
      path: description.path, 
      description: description.description
    };
  }
  this._scope.$apply();
};
p.createAssemblyEditor = function() {
  this.assemblyEditor = ace.edit("assemblyCodeContainer");
  this.assemblyEditor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(this.assemblyEditor);
  this.assemblyEditor.renderer.setOption('showLineNumbers', false);
  var self = this;
  this.assemblyEditor.getSession().selection.on('changeCursor', function(e) {
    self.annotateAssemblyEditor();
  });
};
p.clearAssemblyEditorMarkers = function() {
  var editor = this.assemblyEditor;
  this.assemblyEditorMarkers.forEach(function (marker) {
    editor.session.removeMarker(marker);
  });
  this.assemblyEditorMarkers.length = 0;
};
p.annotateAssemblyEditor = function() {
  var self = this;
  var editor = this.assemblyEditor;
  var line = editor.getSelectionRange().start.row;
  var text = editor.session.getLine(line);
  

  editor.session.clearAnnotations();
  this.clearAssemblyEditorMarkers();

  // Descriptions
  this.instructionDescription = null;
  var mnemonic = match(/\s*(\w*)/, text, 1);
  var description = x86Reference[mnemonic.toUpperCase()];
  if (description) {
    this.instructionDescription = {
      name: mnemonic.toLowerCase(), 
      path: description.path, 
      description: description.description
    };
  }
  this._scope.$apply();

  var address = parseInt(match(/;\s(.*?)\s/, text, 1));
  if (isNaN(address)) {
    return;
  }

  var annotations = [];
  var Search = ace.require('ace/search').Search;
  var search = new Search();

  function highlight(needle, message) {
    search.set({
      needle: needle,
      wrap: true
    });
    var Range = ace.require('ace/range').Range;
    search.findAll(editor.session).reduce(function(lines, range) {
      annotations.push({
        row: range.start.row,
        column: 0,
        text: message,
        type: "warning"
      });
      self.assemblyEditorMarkers.push(editor.session.addMarker(range, 'ace_highlight-marker', 'fullLine'));
    }, []);

  }

  var sources = match(/from\: \[(.*?)\]/, text, 1);
  if (sources) {
    sources = sources.split(",").map(function (x) {
      return parseInt(x);
    });
    sources.forEach(function (source) {
      highlight("; " + toAddress(source), "Branches to " + toAddress(address));
    });
  }

  var instr = self.assemblyInstructionsByAddress[address];
  if (isBranch(instr)) {
    var targetAddress = parseInt(instr.op_str);
    highlight(toAddress(targetAddress) + ":", "Branches from " + toAddress(address));
  }

  self.assemblyEditor.getSession().setAnnotations(annotations);
};

p.createConsoleEditor = function() {
  this.consoleEditor = ace.edit("consoleContainer");
  // this.consoleEditor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(this.consoleEditor, {
    wrap: false, 
    enableBasicAutocompletion: false,
    enableSnippets: false,
    enableLiveAutocompletion: false
  });
}
p.appendConsole = function(s) {
  this.consoleEditor.insert(s + "\n");
};
p.writeWelcomeMessage = function() {
  this.appendConsole(`Welcome to the WebAssembly Explorer
===================================

Here you can translate C/C++ to WebAssembly, and then see the machine code generated by the browser.

For bugs, comments and suggestions see: http://mbebenita.github.io/WasmExplorer
Built with Clang/LLVM, AngularJS, Ace Editor, Emscripten, SpiderMonkey, Binaryen and Capstone.js.

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