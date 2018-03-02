/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

function padRight(s, n, c) {
  s = String(s);
  while (s.length < n) {
    s = s + c;
  }
  return s;
}

function padLeft(s, n, c) {
  s = String(s);
  while (s.length < n) {
    s = c + s;
  }
  return s;
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

  this.appVersion = WasmExplorerVersion;
  this.x86ReferencePath = X86DocsPath;

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
  
  this.loadOptionDefaults();
  this.loadOptions();
  
  this.loadUrlParameters();

  this.optionChanged();

  this.requestServiceVersion();
 
  this.examples = Object.getOwnPropertyNames(cppExamples);
  this.selectedExample;

  this.dialects = ["C89", "C99", "C++98", "C++11", "C++14", "C++1z"];
  

  this.optimizationLevels = ["0", "1", "2", "3", "4", "s"];

  

  this.sharingLink = "";


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

var RunnerCode =
  "WebAssembly.instantiate(wasmCode, {/* imports */}).then(({instance}) => {\n" +
  "  var memory = instance.exports.memory;\n" +
  "  // call any exported function, e.g. instance.exports.main()\n" +
  "  log(Object.keys(instance.exports));\n});";

var p = WasmExplorerAppCtrl.prototype;

var booleanOptionNames = [
  'showGutter', 'showConsole', 'showOptions', 'autoCompile', 'showLLVM', 'darkMode',
  'fastMath', 'noInline', 'noRTTI', 'noExceptions', 'cleanWast', 'wasmBaseline'
];

var stringOptionNames = [
  'dialect', 'optimizationLevel'
];

p.loadOptions = function () {
  var self = this;
  booleanOptionNames.forEach(function (name) {
    self[name] = sessionStorage.getItem(name) === "true";
  });
  stringOptionNames.forEach(function (name) {
    self[name] = sessionStorage.getItem(name);
  });
};

p.saveOptions = function () {
  var self = this;
  booleanOptionNames.forEach(function (name) {
    sessionStorage.setItem(name, self[name]);
  });
  stringOptionNames.forEach(function (name) {
    sessionStorage.setItem(name, self[name]);
  });
};

p.loadOptionDefaults = function() {
  // sessionStorage.clear();

  function set(name, value) {
    if (sessionStorage.getItem(name) == null) {
      sessionStorage.setItem(name, value);
    }
  }
  set("showGutter", true);
  set("showConsole", true);
  set("showOptions", true);
  set("autoCompile", true);
  set("showLLVM", false);
  set("darkMode", true);

  set("fastMath", false);
  set("noInline", false);
  set("noRTTI", false);
  set("noExceptions", false);
  set("cleanWast", false);
  set("wasmBaseline", false);

  set("dialect", "C++11");
  set("optimizationLevel", "s");
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

p.loadUrlParameters = function () {
  var parameters = getUrlParameters();
  if (parameters["state"]) {
    var state = JSON.parse(parameters["state"]);
    if (state.source) {
      this.sourceEditor.setValue(state.source, -1);
    }
    if (state.wast) {
      this.wastEditor.setValue(state.wast, -1);
    }
    this.dialect = state.options.dialect;
    this.optimizationLevel = state.options.optimizationLevel;
    this.fastMath = state.options.fastMath;
    this.noInline = state.options.noInline;
    this.noRTTI = state.options.noRTTI;
    this.noExceptions = state.options.noExceptions;
    this.cleanWast = state.options.cleanWast;
    this.wasmBaseline = state.options.wasmBaseline;
  }
};
p.optionChanged = function (uiOnlyOption) {
  this.saveOptions();

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

  if (!uiOnlyOption) {
    this.tryCompile();
  }
};

p.getSelectedDialectText = function() {
  if (this.dialect !== undefined) {
    return this.dialect;
  } else {
    return "Dialects";
  }
};

p.getSelectedOptimizationLevelText = function() {
  if (this.optimizationLevel !== undefined) {
    return this.optimizationLevel;
  } else {
    return "Optimization Levels";
  }
};

p.changeExample = function changeExample() {
  this.sourceEditor.setValue(cppExamples[this.selectedExample], -1);
  this.tryCompile();
};

p.getSelectedExampleText = function() {
  if (this.selectedExample !== undefined) {
    return this.selectedExample;
  } else {
    return "Examples";
  }
};

p.tryCompile = function () {
  if (this.autoCompile) {
    this.compile();
  }
};

p.toggleOptions = function toggleOptions() {
  this.showOptions = !this.showOptions;
  this.saveOptions();
};

p.toggleLLVM = function toggleLLVM() {
  this.showLLVM = !this.showLLVM;
  this.tryCompile();
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
p.execute = function execute() {
  var self = this;
  var options = [];
  var source = this.wastEditor.getValue();
  if (source.trim() == "") {
    return;
  }

  source = source.replace(/[\s^]+/g, " ");
  source = source.replace(/\"/g, "'");
  source = '"' + source + '"';

  source = source.replace(/\"/g, "'");

  // source.replace(/\"/g, "\\\"");
  // source = "var wasm = wasmTextToBinary(\"" + source + "\");\n";
  // source += "var exports = Wasm.instantiateModule(wasm, {}).exports;\n";
  // source += "putstr(exports.main());\n";
  
  // var source = source.split("\n").map(function(s) {
  //   return "\"" + s + "\\n\"";
  // }).join("\n");
  this.wastEditor.setValue(source);
};

p.gatherOptions = function() {
  var options = [
    "-std=" + this.dialect.toLowerCase(),
    "-O" + this.optimizationLevel
  ];
  if (this.fastMath) options.push("-ffast-math");
  if (this.noInline) options.push("-fno-inline");
  if (this.noRTTI) options.push("-fno-rtti");
  if (this.noExceptions) options.push("-fno-exceptions");
  if (this.cleanWast) options.push("--clean");
  return options;
};

p.compile = function compile() {
  var self = this;
  var options = [];
  var source = this.sourceEditor.getValue();
  if (source.trim() == "") {
    return;
  }
  var inputString = encodeURIComponent(source).replace('%20', '+');
  var actionString = this.dialect.toLowerCase().indexOf("c++") >= 0 ? "cpp2wast" : "c2wast";

  var optionsString = encodeURIComponent(this.gatherOptions().join(" "));
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
  }, "Compiling C/C++ to Wat");

  if (this.showLLVM) {
    var actionString = this.dialect.toLowerCase().indexOf("c++") >= 0 ? "cpp2x86" : "c2x86";
    self.sendRequest("input=" + inputString + "&action=" + actionString + "&options=" + optionsString, function () {
      var x86 = this.responseText;
      self.llvmAssemblyEditor.setValue(x86, -1);
    }, "Compiling C/C++ to LLVM Assembly");
  }
};
p.collaborate = function collaborate() {
  TogetherJS(this);
};
p.openInFiddle = function () {
  var cppCode = this.sourceEditor.getValue();
  if (!cppCode) {
    window.open(WasmFiddleUrl, '_self');
    return;
  }
  var options = "-O" + this.optimizationLevel
  " -std=" + this.dialect.toLowerCase();
  var json = JSON.stringify({
    "editors": {
      "main": cppCode,
      "harness": RunnerCode
    },
    "compilerOptions": options
  });
  var xhr = new XMLHttpRequest();
  xhr.addEventListener("load", function () {
    var uri = JSON.parse(this.response).uri;
    var id = uri.substring(uri.lastIndexOf("/") + 1);
    window.open(WasmFiddleUrl + '?' + id, '_self');
  });
  xhr.open("POST", "//api.myjson.com/bins", true);
  xhr.setRequestHeader("Content-type", "application/json; charset=utf-8");
  xhr.send(json);

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
    comment += "WasmExplorer: " + url + "\n";

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

    window.open("https://bugzilla.mozilla.org/enter_bug.cgi?product=Core&component=JavaScript%20Engine%3A%20JIT&cc=sunfish@mozilla.com&short_desc=&comment=" + encodeURIComponent(comment));
  });  
};
p.getShareUrl = function () {
  var self = this;
  var url = location.protocol + '//' + location.host + location.pathname;
  var options = {};
  booleanOptionNames.forEach(function (name) {
    options[name] = self[name];
  });
  stringOptionNames.forEach(function (name) {
    options[name] = self[name];
  });
  var source = self.sourceEditor.getValue();
  var wast = self.wastEditor.getValue();
  var state = {
    options: options
  };
  if (source) {
    // If we have C/C++ don't include the wat because it's usually too big.
    state.source = source;
  } else {
    state.wast = wast;
  }
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
  if (typeof MCapstone === "undefined") {
    self.lazyLoad(CapstoneLibraryPath, function () {
      var capstone = window.cs;
      self._capstoneInstance = new capstone.Capstone(capstone.ARCH_X86, capstone.MODE_64);
      go();
    });
  } else {
    go();
  }
  function go() {
    self.wastEditor.getSession().clearAnnotations();
    var inputString = encodeURIComponent(wast).replace('%20', '+');
    var actionString = "wast2assembly";
    var options = self.wasmBaseline ? "--wasm-always-baseline" : "";
    var optionsString = encodeURIComponent(options).replace('%20', '+');
    self.sendRequest("input=" + inputString + "&action=" + actionString +
                     "&options=" + optionsString, function () {
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
      var cs = self._capstoneInstance;
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
      self.buildDownload();
    }, "Compiling .wat to x86");

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
  }, "Compiling .wat to .wasm");
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
  xhr.open("POST", WasmExplorerServiceBaseUrl + "service.php", true);
  xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded")
  xhr.send(command);
  self.showProgress(message);

  var evt = document.createEvent('CustomEvent');
  evt.initCustomEvent('serviceevent', false, false, { 'label': message });
  window.dispatchEvent(evt);
};

function setDefaultEditorSettings(editor, options) {
  editor.setFontSize(14);
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.setShowPrintMargin(false);
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
  setDefaultEditorSettings(this.sourceEditor, {
    wrap: true, 
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true
  });
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
  setDefaultEditorSettings(this.wastEditor, {
    wrap: true, 
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true
  });
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
    wrap: false
  });
}
p.appendConsole = function(s) {
  this.consoleEditor.insert(s + "\n");
};
p.writeWelcomeMessage = function() {
  this.appendConsole(`Welcome to the WebAssembly Explorer
===================================

Here you can translate C/C++ to WebAssembly, and then see the machine code generated by the browser.

For bugs, comments and suggestions see: https://github.com/mbebenita/WasmExplorer
Built with Clang/LLVM, AngularJS, Ace Editor, Emscripten, SpiderMonkey, Binaryen and Capstone.js.

`);
};

p.requestServiceVersion = function () {
  var xhr = new XMLHttpRequest();
  var self = this;
  xhr.addEventListener("load", function () {
    var info = JSON.parse(this.responseText);
    self.appendConsole(`Service version ${info.version} (js: ${info.js}; clang: ${info.clang}; binaryen: ${info.binaryen})`);
  });
  xhr.open("GET", WasmExplorerServiceBaseUrl + "version.php", true);
  xhr.send();
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



angular.module('WasmExplorerQueryApp', ['ngMaterial']).controller('WasmExplorerQueryAppCtrl', WasmExplorerQueryAppCtrl);

function WasmExplorerQueryAppCtrl($scope) {
  this.darkMode = true;
  this.showConsole = true;
  this.createSourceEditor();
  this.createQueryEditor();
  this.createConsoleEditor();
  this.setTheme();
  this.examples = ["Wat Source", "ab.wat", "bb.wat"];
  this.selectedExample = "Wat Source";
  this.selectedExampleAST = {};
};

var p = WasmExplorerQueryAppCtrl.prototype;
p.setTheme = function() {
  var theme = this.darkMode ? "ace/theme/monokai" : "ace/theme/github";
  this.wastEditor.setTheme(theme);
  this.consoleEditor.setTheme(theme);
  this.queryEditor.setTheme(theme);
};
p.createSourceEditor = function() {
  var self = this;
  this.wastEditor = ace.edit("wastContainer");
  setDefaultEditorSettings(this.wastEditor, {
    wrap: false
  });
  this.wastEditor.setFontSize(12);
  this.wastEditor.$blockScrolling = Infinity;
  this.wastEditor.setValue(`(func foo
  (set_local $0
    (i32.add
      (i32.add
        (get_local $0)
        (i32.const 2)
      )
      (i32.const 6)
    )
  )
  (set_local $a (get_local $a))
  (set_local $a (get_local $b))
  (set_local $a (i32.add (get_local $a) (i32.const 0)))
  (set_local $a (i32.add (get_local $a) (i32.const 0)))
  (f32.add $a (get_local $a))
)
(func bar
  (f32.add $a (get_local $a))
)`, -1);
};
p.getSelectedExampleText = function() {
  if (this.selectedExample !== undefined) {
    return this.selectedExample;
  } else {
    return "Examples";
  }
};
p.createQueryEditor = function() {
  var self = this;
  this.queryEditor = ace.edit("queryContainer");
  setDefaultEditorSettings(this.queryEditor, {
    
  });
  this.queryEditor.setFontSize(12);
  this.queryEditor.$blockScrolling = Infinity;
  this.queryEditor.setValue(`;; Match all s-expressions.
*

;; Match all (i32.add) s-expressions.
(i32.add)

;; Match all (i32.add) s-expressions where the left hand side is an (i32.add) expression.
(i32.add (i32.add) *)

;; Match copy local.
(set_local * (get_local *))

;; Match all (i32.add) s-expressions where the right hand side is a constant larger than 4. 
;; The $ sigil refers to the current expression. You can access the |value| property to
;; refer to its text value.
(i32.add * (i32.const {$.value>4}))

;; Match all (set_local) where the value of the first child of the right hand side is "get_local". 
;; There are easier way to do this but this shows how you can access child nodes using [].
(set_local * {$[0].value == "get_local"})

;; Match using regular expressions.
({/i32/})

;; Match increment local. The |parent| property can be used to refer to expressions up the tree.
(set_local * (i32.add (get_local {$.parent.parent.parent[1].value == $.value}) (i32.const *)))

;; Compute a histogram of all i32.constants using the |histogram| helper function.
(i32.const {histogram("A", parseInt($.value))})

;; Histogram of all i32.XXX operations.
({/i32/} {histogram("i32.xxx", $.parent[0])})

;; Match all (f32.add) expressions and find the first ancestor whose first expression is equal 
;; to "function" then print that ancestor's second expression. This effectively prints out the
;; name of the function where the expression appears.
(f32.add { print(findAncestor($, "func", 0)[1]) })

;; You could also combine this with a histogram.
(f32.add { histogram("A", findAncestor($, "func", 0)[1]) })

`, -1);
  this.queryEditor.commands.addCommand({
    name: 'runCommand',
    bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
    exec: function(editor) {
      self.run();
    },
    readOnly: true
  });
}
p.createConsoleEditor = function() {
  this.consoleEditor = ace.edit("consoleContainer");
  setDefaultEditorSettings(this.consoleEditor, {
    wrap: false
  }); 
  this.consoleEditor.setFontSize(12);
  this.consoleEditor.$blockScrolling = Infinity;
}
p.appendConsole = function(s) {
  this.consoleEditor.insert(s + "\n");
  this.consoleEditor.gotoLine(Infinity); 

  // this.consoleEditor.selection.moveTo(Infinity, Infinity);
};

var histograms = {};
function histogram(name, value) {
  if (!histograms[name]) {
    histograms[name] = {};
  }
  if (!histograms[name].hasOwnProperty(value)) {
    histograms[name][value] = 0;
  }
  histograms[name][value] ++;
  return true;
}

function printHistograms() {
  var names = Object.getOwnPropertyNames(histograms);
  names.forEach(name => {
    var histogramText = "Histogram " + name;
    print(histogramText);
    print("-".repeat(histogramText.length))
    var histogram = histograms[name];
    var keyValuePairs = [];
    var maxKeyLength = 4;
    var maxValueLength = 0;
    var sum = 0;
    var ignore = 0;
    var ignoreSum = 0;
    var ignoreThreshold = 0.001;
    for (var key in histogram) {
      sum += histogram[key];
    }
    for (var key in histogram) {
      var percent = histogram[key] / sum;
      if (percent < ignoreThreshold) {
        ignore ++;
        ignoreSum += histogram[key];
        continue;
      }
      keyValuePairs.push([key, histogram[key]]);
      maxKeyLength = Math.max(maxKeyLength, key.length);
      maxValueLength = Math.max(maxValueLength, String(histogram[key]).length);
    }
    maxValueLength = Math.max(maxValueLength, String(ignore).length);
    var sortedKeyValuePairs = keyValuePairs.sort(function (a, b) {
      return b[1] - a[1];
    });
    sortedKeyValuePairs.forEach(pair => {
      var percent = pair[1] / sum;
      if (percent > ignoreThreshold) {
        print(padLeft(pair[0], maxKeyLength, " ") + " " + padRight(pair[1], maxValueLength, " ") + " " + (percent * 100).toFixed(2) + "%");
      }
    });
    if (ignore) {
      print(padLeft("< " + (ignoreThreshold * 100).toFixed(2) + "%", maxKeyLength, " ")  + " " + padRight(ignore, maxValueLength, " ") + " " + (ignoreSum / sum * 100).toFixed(2) + "%");
    }
  });
}

function findAncestor(node, value, index) {
  index = index === undefined ? 0 : index;
  while (node) {
    if (node[index] == value) {
      return node;
    }
    node = node.parent;
  }
  return;
}

p.run = function () {
  var self = this;
  window.print = function (message) {
    self.appendConsole(message);
  };

  window.histogram = histogram; 
  var queryText = this.queryEditor.getValue();
  var queryAst = parseSExpression(queryText);
  
  if (this.selectedExample !== "Wat Source") {
    var ast = this.selectedExampleAST[this.selectedExample];
    if (ast) {
      go(ast)
    } else {
      var xhr = new XMLHttpRequest();
      xhr.addEventListener("load", function () {
        var source = this.responseText;
        self.appendConsole("Parsing and Caching AST, please wait ...");
        setTimeout(function () {
          ast = parseSExpression(source);  
          self.selectedExampleAST[self.selectedExample] = ast;
          go(ast);
        }, 1);
      });
      xhr.open("GET", this.selectedExample, true);
      xhr.send();
      self.appendConsole("Downloading " + this.selectedExample + ", this may take a while ...");  
    }
    
  } else {
    setTimeout(function () {
      var ast = parseSExpression(self.wastEditor.getValue());  
      go(ast);
    }, 1);
  }
  
  function dotify(text, length) {
    if (text.length > length) {
      return text.substring(0, length - 4) + " ...";
    }
    return text;
  }
  function go(ast) {
    runQueries();
    function runQueries() {
      var i = 0; 
      var queries = Array.prototype.map.call(queryAst, x => x);
      function next() {
        var query = queries.shift();
        if (!query) {
          return;
        }
        histograms = {};
        var queryExpression = compile("$", query);
        try {
          var queryFn = new Function("$", "  return " + queryExpression + ";");
          var queryMessage = `Executing Query ${i}: ` + dotify(String(query), 128);
        } catch (x) {
          self.appendConsole(x);
          setTimeout(next, 1);
          return;
        }
        i++;
        self.appendConsole(queryMessage);
        self.appendConsole("-".repeat(queryMessage.length));

        var start = performance.now();
        var max = 16;
        var count = 0;
        ast.visit(function (node) {
          if (queryFn(node)) {
            if (count < max) {
              self.appendConsole(String(count) + ": " + node);
            } else if (count === max) {
              self.appendConsole("...");
            }
            count++;
          }
          return true;
        });
        self.appendConsole("-".repeat(queryMessage.length));
        self.appendConsole(count + " expressions found in " + (performance.now() - start).toFixed(2) + "ms\n");
        printHistograms();
        setTimeout(next, 1);
      }
      next();
    }
  }
};
