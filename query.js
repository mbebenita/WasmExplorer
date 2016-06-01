if (typeof assert === 'undefined') {
	var assert = function(c, msg) {
		if (!c) {
			alert(msg);
			quit();
		}
	};
}

// Element list or string.
function Element(str, dollared, quoted, code) {
	this.list = null;
	this.str = str === undefined ? null : str;
	this.dollared = !!dollared;
	this.quoted = !!quoted;
	this.code = !!code;
}

Element.prototype.isSymbol = function() {
	return this.str !== null;
};

Element.prototype.isList = function() {
	return this.str === null;
};

Element.prototype.isCode = function() {
	return this.code;
};

Element.prototype.toString = function() {
	if (this.str !== null) {
		if (this.dollared) {
			return "$" + this.str;
		}
		if (this.quoted) {
			return `"${this.str}"`;
		}
		if (this.code) {
			return `"{${this.str}}"`;
		}
		return this.str;
	}
	return `(${this.list.map(x => x.toString()).join(" ")})`;
};

Element.prototype.visit = function(visitor) {
	if (visitor(this)) {
		if (this.list) {
			for (var i = 0; i < this.list.length; i++) {
				this.list[i].visit(visitor, i);
			}
		}
	}
};

function parseSExpression(text) {
	var input = 0;

	var commentDepth = 0;

	function skipBlockComment() {
		while (true) {
			if (text[input] === '(' && text[input + 1] === ';') {
				input += 2;
				commentDepth++;
			} else if (text[input] === ';' && text[input + 1] === ')') {
				input += 2;
				commentDepth--;
				if (!commentDepth) {
					return;
				}
			} else {
				input++;
			}
		}
	}

	function parseInnerList() {
		if (text[input] === ';') {
			// Parse comment.
			input++;
			if (text[input] === ';') {
				while (text[input] != '\n') input++;
				return null;
			}
			assert(false, 'malformed comment');
		}

		if (text[input] === '(' && text[input + 1] === ';') {
			skipBlockComment();
			return null;
		}

		var start = input;
		var ret = new Element();
		while (true) {
			var curr = parse();
			if (!curr) {
				return ret;
			}
			if (!ret.list) {
				ret.list = [];
			}
			ret.list.push(curr);
		}
	}

	function isSpace(c) {
		switch (c) {
			case '\n':
			case ' ':
			case '\r':
			case '\t':
			case '\v':
			case '\f':
				return true;
			default:
				return false;
		}
	}

	function skipWhitespace() {
		while (true) {
			while (isSpace(text[input]))
				input++;

			if (text[input] === ';' && text[input + 1] === ';') {
				while (text.length > input && text[input] != '\n') input++;
			} else if (text[input] === '(' && text[input + 1] === ';') {
				skipBlockComment();
			} else {
				return;
			}
		}
	}

	function parseString() {
		var dollared = false;
		var quoted = false;
		if (text[input] === '$') {
			input++;
			dollared = true;
		}

		var start = input;
		if (text[input] === '"') {
			quoted = true;
			// Parse escaping \", but leave code escaped - we'll handle escaping in memory segments specifically.
			input++;
			var str = "";
			while (true) {
				if (text[input] === '"') break;
				if (text[input] === '\\') {
					str += text[input];
					str += text[input + 1];
					input += 2;
					continue;
				}
				str += text[input];
				input++;
			}
			input++;
			return new Element(str, dollared, quoted);
		} else if (text[input] === '{') {
			var str = "";
			input++;
			while (true) {
				if (text[input] === '}') {
					input++;
					break;
				}
				str += text[input++];
			}
			return new Element(str, false, false, true);
		}
		while (text.length > input &&
			!isSpace(text[input]) &&
			text[input] != ')' &&
			text[input] != '(') {
			input++;
		}

		return new Element(text.substring(start, input), dollared);
	}

	function parse() {
		skipWhitespace();

		if (text.length === input || text[input] === ')')
			return null;

		if (text[input] === '(') {
			input++;
			var ret = parseInnerList();
			skipWhitespace();
			assert(text[input] === ')', 'inner list ends with a )');
			input++;
			return ret;
		}

		return parseString();
	}

	var root = null;
	while (!root) { // Keep parsing until we pass an initial comment.
		root = parseInnerList();
	}
	return root;
}

function compile(ref, node, i) {
	if (node.isList()) {
		return `${ref}.isList() && (${compileList(ref, node.list)})`;
	} else if (node.str === "*") {
		return `true`;
	} else if (node.isCode()) {
		return node.str.replace(/\$/g, function () {
			return `(${ref}.list[${i}].str)`;
		}); 
	} else if (i === undefined) {
		return `${ref}.str === "${node.str}"`;
	} else {
		return `${ref}.list[${i}].str === "${node.str}"`;
	}
}
function compileList(ref, list) {
	return list.map(function (node, i) {
		if (node.isList()) {
			var child = ref + "$";
			return `(${child} = ${ref}.list[${i}], ${compile(child, node, i)})`;
		}
		return compile(ref, node, i);
	}).join(" && ");
}
