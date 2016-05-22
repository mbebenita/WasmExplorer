/**
 * You must include the dependency on 'ngMaterial' 
 */
angular.module('WasmExplorerApp', ['ngMaterial']).controller('WasmExplorerAppCtrl', WasmExplorerAppCtrl);

function WasmExplorerAppCtrl($scope, $timeout) {
  this._scope = $scope;
  this._timeout = $timeout;
  
  this.sourceEditor = null;
  this.wastEditor = null;
  this.assemblyEditor = null;

  this.hideProgress();

  this.createSourceEditor();
  this.createWastEditor();
  this.createAssemblyEditor();


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
}

var p = WasmExplorerAppCtrl.prototype;

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
p.compile = function compile() {
  var self = this;
  var options = [];
  var source = this.sourceEditor.getValue();
  var inputString = encodeURIComponent(source).replace('%20', '+');
  var actionString = "cpp2wast";

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
    }

    self.wastEditor.setValue(wast, -1);
    self.assemble();
  }, "Compiling C/C++ to Wast");
};
p.assemble = function assemble() {
  var self = this;
  var wast = self.wastEditor.getValue();
  if (wast.indexOf("module") < 0) {
    self.assemblyEditor.getSession().setValue("; Doesn't look like a wasm module.", 1);
    // document.getElementById('downloadLink').href = '';
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
        self.assemblyEditor.getSession().setValue("; " + json, -1);
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

      // buildDownload();
    }, "Assembling Wast to x86");

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

  // function assemble() {
  // var wast = wastEditor.getValue();
  // if (wast.indexOf("module") < 0) {
  //   x86Editor.getSession().setValue("; Doesn't look like a wasm module.", 1);
  //   document.getElementById('downloadLink').href = '';
  //   return;
  // }
  // if (typeof capstone === "undefined") {
  //   lazyLoad("lib/capstone.x86.min.js", go);
  // } else {
  //   go();
  // }
  // function go() {
  //   wastEditor.getSession().clearAnnotations();
  //   sendRequest("input=" + encodeURIComponent(wast).replace('%20', '+') + "&action=wast2assembly", function () {
  //     var json = JSON.parse(this.responseText);
  //     if (typeof json === "string") {
  //       var parseError = "wasm text error: parsing wasm text at ";
  //       if (json.indexOf(parseError) == 0) {
  //         var location = json.substring(parseError.length).split(":");
  //         var line = Number(location[0]) - 1;
  //         var column = Number(location[1]) - 1;
  //         var Range = ace.require('ace/range').Range;
  //         var mark = wastEditor.getSession().addMarker(new Range(line, column, line, column + 1), "marked", "text", false);

  //         wastEditor.getSession().setAnnotations([{
  //           row: line,
  //           column: column,
  //           text: json,
  //           type: "error" // also warning and information
  //         }]);

  //         setTimeout(function() {
  //           wastEditor.session.removeMarker(mark);
  //         }, 5000);
  //       }
  //       x86Editor.getSession().setValue("; " + json, 1);
  //       return;
  //     }
  //     var s = "";
  //     var cs = new capstone.Cs(capstone.ARCH_X86, capstone.MODE_64);
  //     for (var i = 0; i < json.regions.length; i++) {
  //       var region = json.regions[i];
  //       s += region.name + ":\n\n";
  //       var csBuffer = decodeRestrictedBase64ToBytes(region.bytes);
  //       var instructions = cs.disasm(csBuffer, region.entry);
  //       instructions.forEach(function(instr) {
  //         s += padRight(instr.mnemonic + " " + instr.op_str, 38, " ");
  //         s += "; " + toAddress(instr.address) + " " + toBytes(instr.bytes) + "\n";
  //       });
  //       s += "\n";
  //     }
  //     x86Editor.getSession().setValue(s, 1);
  //     cs.delete();

  //     buildDownload();
  //   }, "Assembling Wast to x86");
  // }
}
p.showProgress = function () {
  this.progressMpde = "indeterminate";
};
p.hideProgress = function () {
  this.progressMpde = "determinate";
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

function setDefaultEditorSettings(editor) {
  editor.setTheme("ace/theme/github");
  editor.setFontSize(14);
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
    wrap: true
  });
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

p.createSourceEditor = function() {
  var self = this;
  this.sourceEditor = ace.edit("sourceCodeContainer");
  this.sourceEditor.getSession().setMode("ace/mode/c_cpp");
  setDefaultEditorSettings(this.sourceEditor);
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
  setDefaultEditorSettings(this.wastEditor);
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




/*
function createBanner() {
  function resize() {
    var pattern = Trianglify({
      height: 64,
      width: window.innerWidth,
      cell_size: 40
    });
    pattern.canvas(document.getElementById('banner'));  
  }
  var width = $(window).width();
  $(window).resize(function(){
     if($(this).width() != width){
        width = $(this).width();
        resize();
     }
  });
  resize();
}

var gui;
var generalSettings = { "Auto Compile": false };
function onChangeSettings() {
  if (generalSettings["Auto Compile"]) {
    compile();
  }
} 
function createSettings() {
  var load;
  var urlParameters = getUrlParameters();
  if (urlParameters["settings"]) {
    load = JSON.parse(urlParameters["settings"]);
  }
  gui = new dat.GUI({ autoPlace: false, width: 280, load: load });

  gui.add(generalSettings, "Auto Compile");
  document.getElementById('settingsContainer').appendChild(gui.domElement);
}

var llvmTransformPasses = [
  { name: "fast-math", option: "-ffast-math"},
  { name: "no-inline", option: "-fno-inline"},
  { name: "no-rtti", option: "-fno-rtti"},
  { name: "no-exceptions", option: "-fno-exceptions"},
  { name: "std=c++14", option: "-std=c++14"},
  { name: "std=c++1z", option: "-std=c++1z"},
  { name: "std=c11", option: "-std=c11"},
  { name: "std=c1x", option: "-std=c1x"}
];

var cppOptions = {
  'Optimization Level': "s"
};

llvmTransformPasses.forEach(x => {
  cppOptions[x.name] = false;
})

function setDefaultEditorSettings(editor) {
  editor.setTheme("ace/theme/github");
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true
  });
}

function createsourceEditor() {
  sourceEditor = ace.edit("cppCodeContainer");
  sourceEditor.getSession().setMode("ace/mode/c_cpp");
  setDefaultEditorSettings(sourceEditor);
  sourceEditor.commands.addCommand({
    name: 'assembleCommand',
    bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
    exec: function(editor) {
      compile();
    },
    readOnly: true // false if this command should not apply in readOnly mode
  });

  gui.remember(cppOptions);


  var clangSettings = gui.addFolder('Clang / LLVM Settings');
  var controller = clangSettings.add(cppOptions, 'Optimization Level', { "0": 0, "1": 1, "2": 2, "3": 3 , "s": "s"});
  controller.onChange(onChangeSettings);

  llvmTransformPasses.forEach(x => {
    controller = clangSettings.add(cppOptions, x.name);
    controller.onChange(onChangeSettings);
  })
  clangSettings.open();

}

function createWastEditor() {
  wastEditor = ace.edit("wastCodeContainer");
  setDefaultEditorSettings(wastEditor);
  wastEditor.commands.addCommand({
    name: 'assembleCommand',
    bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
    exec: function(editor) {
      assemble();
    },
    readOnly: true // false if this command should not apply in readOnly mode
  });
}

function createX86Editor() {
  x86Editor = ace.edit("x86CodeContainer");
  x86Editor.getSession().setMode("ace/mode/assembly_x86");
  setDefaultEditorSettings(x86Editor);
}

function begin() {
  createSettings();
  createBanner();

  ace.require("ace/ext/language_tools");
  createsourceEditor();
  createWastEditor();
  createX86Editor();

  createExamples();
  output = document.getElementById('x86Code');
}


document.getElementById('toggleSettings').onclick = toggleSettings;
document.getElementById('shareCpp').onclick = share.bind(null, "cpp");
document.getElementById('shareWast').onclick = share.bind(null, "wast");
document.getElementById('compileC').onclick = compile.bind(null, "c");
document.getElementById('compile').onclick = compile.bind(null, "cpp");
document.getElementById('assemble').onclick = assemble;
document.getElementById('beautify').onclick = beautify;
document.getElementById('download').onclick = download;

var isBinaryenInstantiated = false;

function captureOutput(fn) {
  var old = console.log;
  var str = [];
  console.log = function(x) {
    str.push(x);
  };
  fn();
  console.log = old;
  return str.join("\n");
}

var settingsAreOpen = false;
function toggleSettings() {
  if (settingsAreOpen) {
    $('#settingsContainer').css({"display": "none", "visibility": "hidden"});
  } else {
    $('#settingsContainer').css({"display": "block", "visibility": "visible"});
  }
  settingsAreOpen = !settingsAreOpen;
}

function beautify() {
  if (typeof Binaryen === "undefined") {
    lazyLoad("lib/binaryen.js", go)
  } else {
    go();
  }

  function go() {
    if (!isBinaryenInstantiated) {
      Binaryen = Binaryen();
      isBinaryenInstantiated = true;
    }
    var wast = wastEditor.getValue();
    var module = new Binaryen.Module();
    var parser = new Binaryen.SExpressionParser(wast);
    var s_module = parser.get_root().getChild(0);
    var builder = new Binaryen.SExpressionWasmBuilder(module, s_module);

    wast = captureOutput(function() {
      Binaryen.WasmPrinter.prototype.printModule(module);
    });
    wastEditor.setValue(wast, 1);
    var interface_ = new Binaryen.ShellExternalInterface();
    var instance = new Binaryen.ModuleInstance(module, interface_);
  }
}

function download() {
  if (document.getElementById('downloadLink').href != document.location) {
    document.getElementById("downloadLink").click();
  }
}

function lazyLoad(s, cb) {
  document.getElementById("spinner").style.visibility = 'visible';
  document.getElementById("spinnerLabel").innerHTML = "Loading " + s;
  var d = window.document;
  var b = d.body;
  var e = d.createElement("script");
  e.async = true;
  e.src = s;
  b.appendChild(e);
  e.onload = function () {
    document.getElementById("spinnerLabel").innerHTML = "";
    document.getElementById("spinner").style.visibility = "hidden";
    cb.call(this);
  }
}

function share(type) {
  var url = location.protocol + '//' + location.host + location.pathname;
  if (type == "cpp") {
    url = url + "?cpp=" + encodeURIComponent(sourceEditor.getValue());  
  } else {
    url = url + "?wast=" + encodeURIComponent(wastEditor.getValue());  
  }
  url += "&settings=" + encodeURIComponent(JSON.stringify(gui.getSaveObject()))
  $('#shareURL').fadeTo(500,1);
  shortenUrl(url, function (url) {
    $('#shareURL').val(url).select();
  });
}

function sendRequest(command, cb, message) {
  var xhr = new XMLHttpRequest();
  xhr.addEventListener("load", function () {
    document.getElementById("spinnerLabel").innerHTML = "";
    document.getElementById("spinner").style.visibility = "hidden";
    cb.call(this);
  });
  xhr.open("POST", "//areweflashyet.com/tmp/wasm/service.php", true);
  xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded")
  xhr.send(command);
  if (message) {
    document.getElementById("spinnerLabel").innerHTML = message;
  }
  document.getElementById("spinner").style.visibility = 'visible';
}

function compile(language) {
  var action = language === "c" ? "c2wast" : "cpp2wast";
  var options = ["-O" + cppOptions['Optimization Level']];

  llvmTransformPasses.forEach(x => {
    if (cppOptions[x.name]) {
      options.push(x.option);
    }
  });

  var cpp = sourceEditor.getValue();
  sourceEditor.getSession().clearAnnotations();
  sendRequest("input=" + encodeURIComponent(cpp).replace('%20', '+') + "&action=" + action + "&options=" + encodeURIComponent(options.join(" ")), function () {
    var wast = this.responseText;

    // Parse and annotate errors if compilation fails.
    if (wast.indexOf("(module") !== 0) {
      var re = /^.*?:(\d+?):(\d+?):(.*)$/gm; 
      var m;
      while ((m = re.exec(wast)) !== null) {
        if (m.index === re.lastIndex) {
            re.lastIndex++;
        }
        var line = parseInt(m[1]) - 1;
        var column = parseInt(m[2]) - 1;
        var message = m[3];
        sourceEditor.getSession().setAnnotations([{
          row: line,
          column: column,
          text: message,
          type: message.indexOf("error") >= 0 ? "error" : "warning" // also warning and information
        }]);
      }
    }
    
    wastEditor.setValue(wast, 1);
    assemble();
  }, "Compiling C/C++ to Wast");
}

function buildDownload() {
  document.getElementById('downloadLink').href = '';
  var wast = wastEditor.getValue();
  if (!/^\s*\(module\b/.test(wast)) {
    return; // Sanity check
  }
  sendRequest("input=" + encodeURIComponent(wast).replace('%20', '+') + "&action=wast2wasm", function () {
    var wasm = this.responseText;
    if (wasm.indexOf("WASM binary data") < 0) {
      console.log('Error during WASM compilation: ' + wasm);
      return;
    }
    document.getElementById('downloadLink').href = "data:;base64," + wasm.split('\n')[1];
  }, "Compiling Wast to Wasm");
}

function assemble() {
  var wast = wastEditor.getValue();
  if (wast.indexOf("module") < 0) {
    x86Editor.getSession().setValue("; Doesn't look like a wasm module.", 1);
    document.getElementById('downloadLink').href = '';
    return;
  }
  if (typeof capstone === "undefined") {
    lazyLoad("lib/capstone.x86.min.js", go);
  } else {
    go();
  }
  function go() {
    wastEditor.getSession().clearAnnotations();
    sendRequest("input=" + encodeURIComponent(wast).replace('%20', '+') + "&action=wast2assembly", function () {
      var json = JSON.parse(this.responseText);
      if (typeof json === "string") {
        var parseError = "wasm text error: parsing wasm text at ";
        if (json.indexOf(parseError) == 0) {
          var location = json.substring(parseError.length).split(":");
          var line = Number(location[0]) - 1;
          var column = Number(location[1]) - 1;
          var Range = ace.require('ace/range').Range;
          var mark = wastEditor.getSession().addMarker(new Range(line, column, line, column + 1), "marked", "text", false);

          wastEditor.getSession().setAnnotations([{
            row: line,
            column: column,
            text: json,
            type: "error" // also warning and information
          }]);

          setTimeout(function() {
            wastEditor.session.removeMarker(mark);
          }, 5000);
        }
        x86Editor.getSession().setValue("; " + json, 1);
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
      x86Editor.getSession().setValue(s, 1);
      cs.delete();

      buildDownload();
    }, "Assembling Wast to x86");
  }

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
};

// Divider Resizing
var divider2storage = $("#cppContainer").width();

$(".divider").draggable({
  axis: "x",
  containment: $("#contentContainer"),
  drag: function(e, ui) {
    if (ui.helper[0].id === "divider-1") {
      $("#x86Container").css("flex", "0 1 " + $("#x86Container").width() + "px"); 
      $("#wastContainer").css("flex", "1");
      $("#cppContainer").css("flex", "0 1 " + (ui.offset.left - 20) + "px");
    } else if (ui.helper[0].id === "divider-2") {
      $("#cppContainer").css("flex", "0 1 " + $("#cppContainer").width() + "px");
      $("#x86Container").css("flex", "1");
      $("#wastContainer").css("flex", "0 1 " + (divider2storage + ui.position.left) + "px");
    }
  },
  stop: function(e, ui) {
    if (ui.helper[0].id === "divider-2") {
      divider2storage = divider2storage + ui.position.left;
    } else {
      divider2storage = $("#wastContainer").width();
    }
  }
});

var cppExamples = {
  "Q_rsqrt": `float Q_rsqrt(float number) {
  long i;
  float x2, y;
  const float threehalfs = 1.5F;

  x2 = number * 0.5F;
  y  = number;
  i  = *(long *) &y;
  i  = 0x5f3759df - (i >> 1);
  y  = *(float *) &i;
  y  = y * (threehalfs - (x2 * y * y));
  y  = y * (threehalfs - (x2 * y * y));

  return y;
}`,
  "testFunction": `int testFunction(int* input, int length) {
  int sum = 0;
  for (int i = 0; i < length; ++i) {
    sum += input[i];
  }
  return sum;
}`,
  "fact": `double fact(int i) {
  long long n = 1;
  for (;i > 0; i--) {
    n *= i;
  }
  return (double)n;
}`,
  "virtual": `struct A {
  A();
  ~A();
  virtual void virtual_member_function();
};
 
A *ctor() {
  return new A();
}
void dtor(A *a) {
  delete a;
}
void call_member_function(A *a) {
  a->virtual_member_function();
}`,
  "popcnt": `int main(int a) {
  return __builtin_popcount(a) + 
         __builtin_popcount(a);
}`,"fast-math": `// compile with/without -ffast-math

double foo(double d) {
  return d / 3.0;
}

double maybe_min(double d, double e) {
  return d < e ? d : e;
}

double pow(double x, double y);
     
double call_pow(double x) {
  return pow(x, 8);
}
 
double do_pow(double x) {
  return x*x*x*x*x*x*x*x;
}
 
double factor(double a, double b, double c) {
  return (a * c) + (b * c);
}
`, "duff": `
  More expressive control flow constructs are needed to 
  implement Duff's device effectively.
  See: 
  https://github.com/WebAssembly/design/blob/master/FutureFeatures.md#more-expressive-control-flow
  
void send(char *to, char *from, unsigned long count)
{
  unsigned long n = (count + 7) / 8;
  switch (count % 8) {
  case 0: do { *to++ = *from++;
  case 7:      *to++ = *from++;
  case 6:      *to++ = *from++;
  case 5:      *to++ = *from++;
  case 4:      *to++ = *from++;
  case 3:      *to++ = *from++;
  case 2:      *to++ = *from++;
  case 1:      *to++ = *from++;
    } while (--n > 0);
  }
}
`
}

// Do stuff if we have URL params.

function createExamples() {
  var el = document.getElementById("cppExamples");
  for (var k in cppExamples) {
    var option = document.createElement("option");
    option.text = k;
    option.value = k;
    el.add(option);
  }
  el.addEventListener("change", function () {
    sourceEditor.setValue(cppExamples[this.value], 1);
    compile();
  });

  var urlParameters = getUrlParameters();
  if (urlParameters["cpp"]) {
    sourceEditor.setValue(urlParameters["cpp"], 1);
    compile();
  } else if (urlParameters["wast"]) {
    wastEditor.setValue(urlParameters["wast"], 1);
    assemble();
  } else {
    sourceEditor.setValue(cppExamples["popcnt"], 1);
    compile();
  }
}

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
    $(document.body).append('<script src="//apis.google.com/js/client.js?onload=googleJSClientLoaded">');
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
*/
