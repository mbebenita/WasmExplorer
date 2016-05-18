hljs.initHighlightingOnLoad();


var cppEditor = null;
var wastEditor = null;
var output;

function createBanner() {
  function resize() {
    var pattern = Trianglify({
      height: 128,
      width: window.innerWidth,
      cell_size: 40
    });
    pattern.canvas(document.getElementById('banner'));  
  }
  window.addEventListener("resize", resize);
  resize();
}

function resizeEditors() {
  var width;
  if (cppEditor) {
    width = document.getElementById('cppContainer').clientWidth - 10;
    width = Math.round(width / 20) * 20
    cppEditor.setSize(width, 800);
  }

  if (wastEditor) {
    width = document.getElementById('wastContainer').clientWidth - 10;
    width = Math.round(width / 20) * 20
    wastEditor.setSize(width, 800);
  }
}

function createCppEditor() {
  cppEditor = CodeMirror.fromTextArea(document.getElementById('cppCode'), {
    viewportMargin: Infinity,
    matchBrackets: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true,
    lineNumbers: true
  });
  cppEditor.setOption("extraKeys", {
    'Cmd-Enter': function(cm) {
      compile();
    },
    'Ctrl-Enter': function(cm) {
      compile();
    }
  });  
  resizeEditors();
  // cppEditor.getDoc().setValue('(module \n  (func $foo(param i32) (result i32) (i32.popcnt (get_local 0)))\n  (func $bar(param i32) (result i32) (call $foo (get_local 0)))\n)');
}

window.addEventListener("resize", resizeEditors);

function createWastEditor() {
  wastEditor = CodeMirror.fromTextArea(document.getElementById('wastCode'), {
    viewportMargin: Infinity,
    matchBrackets: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true,
    lineNumbers: true
  });
  wastEditor.setOption("extraKeys", {
    'Cmd-Enter': function(cm) {
      assemble();
    },
    'Ctrl-Enter': function(cm) {
      assemble();
    }
  });
  resizeEditors();
  wastEditor.getDoc().setValue('(module \n  (func $foo(param i32) (result i32) (i32.popcnt (get_local 0)))\n  (func $bar(param i32) (result i32) (call $foo (get_local 0)))\n)');
}

function begin() {
  createBanner();
  createCppEditor();
  createWastEditor();
    
  output = document.getElementById('x86Code');
}

document.getElementById('share').onclick = share;
document.getElementById('compile').onclick = compile;
document.getElementById('assemble').onclick = assemble;
document.getElementById('beautify').onclick = beautify;

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
    var wast = wastEditor.getDoc().getValue();
    var module = new Binaryen.Module();
    var parser = new Binaryen.SExpressionParser(wast);
    var s_module = parser.get_root().getChild(0);
    var builder = new Binaryen.SExpressionWasmBuilder(module, s_module);

    wast = captureOutput(function() {
      Binaryen.WasmPrinter.prototype.printModule(module);
    });
    wastEditor.getDoc().setValue(wast);
    var interface_ = new Binaryen.ShellExternalInterface();
    var instance = new Binaryen.ModuleInstance(module, interface_);
  }
}

function log(s) {
  var c = document.getElementById("console");
  c.innerHTML = c.innerHTML + s + "<br>";
}

function lazyLoad(s, cb) {
  log("Loading " + s);
  var d = window.document;
  var b = d.body;
  var e = d.createElement("script");
  e.async = true;
  e.src = s;
  b.appendChild(e);
  e.onload = cb;
}

function share() {
  alert("NYI");
}

function compile() {
  alert("NYI");
}

function assemble() {
  var wast = wastEditor.getDoc().getValue();

  function toAddress(n) {
    var s = n.toString(16);
    while (s.length < 6) {
      s = "0" + s;
    }
    return "0x" + s;
  }

  function reqListener() {
    document.getElementById("spinner").style.visibility = "hidden";
    var json = JSON.parse(this.responseText);
    if (typeof json === "string") {
      var parseError = "wasm text error: parsing wasm text at ";
      if (json.indexOf(parseError) == 0) {
        var location = json.substring(parseError.length).split(":");
        var line = Number(location[0]) - 1;
        var column = Number(location[1]) - 1;
        var mark = wastEditor.markText({
          line: line,
          ch: column
        }, {
          line: line,
          ch: 1000
        }, {
          className: "wasm-error"
        });
        setTimeout(function() {
          mark.clear();
        }, 5000);
      }
      output.innerHTML = json;
      return;
    }
    var s = "";
    var cs = new capstone.Cs(capstone.ARCH_X86, capstone.MODE_64);
    for (var i = 0; i < json.length; i++) {
      var code = json[i];
      s += "\n.function_" + i + "\n\n";
      var csBuffer = decodeRestrictedBase64ToBytes(code);
      var instructions = cs.disasm(csBuffer, 0);
      instructions.forEach(function(instr) {
        s += toAddress(instr.address) + " " + instr.mnemonic + " " + instr.op_str + "\n";
      });
    }
    output.innerHTML = s;
    hljs.highlightBlock(output);
    cs.delete();
  }

  if (typeof capstone === "undefined") {
    lazyLoad("lib/capstone.min.js", go);
  } else {
    go();
  }

  function go() {
    var xhr = new XMLHttpRequest();
    xhr.addEventListener("load", reqListener);
    xhr.open("POST", "http://54.235.66.121/tmp/wasm/wasm.php", true);
    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded")
    xhr.send("wast=" + encodeURIComponent(wast).replace('%20', '+'));
    document.getElementById("spinner").style.visibility = 'visible';
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
    resizeEditors();
  },
  stop: function(e, ui) {
    if (ui.helper[0].id === "divider-2") {
      divider2storage = divider2storage + ui.position.left;
    } else {
      divider2storage = $("#wastContainer").width();
    }
  }
});









