/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

if (typeof assert === 'undefined') {
	var assert = function(c, msg) {
		if (!c) {
			alert(msg);
			quit();
		}
	};
}

// Element list or string.
function Element(parent) {
	this.parent = parent;
	this.value = null;
	this.dollared = false;
	this.quoted = false;
	this.code = false;
	this.length = -1; // A length of 0 means an empty list, -1 is no list at all.
}

Element.prototype.push = function(child) {
	if (this.length < 0) {
		this.length = 0;
	}
	this[this.length++] = child;
};

Element.prototype.isSymbol = function() {
	return this.value !== null;
};

Element.prototype.isList = function() {
	return this.value === null;
};

Element.prototype.toString = function() {
	if (this.value !== null) {
		if (this.dollared) {
			return "$" + this.value;
		}
		if (this.quoted) {
			return `"${this.value}"`;
		}
		if (this.code) {
			return `"{${this.value}}"`;
		}
		return this.value;
	}
	return `(${Array.prototype.map.call(this, x => x.toString()).join(" ")})`;
};

Element.prototype.visit = function(visitor) {
	if (visitor(this)) {
		if (this.length > 0) {
			for (var i = 0; i < this.length; i++) {
				this[i].visit(visitor, i);
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

	function parseInnerList(parent) {
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
		var element = new Element(parent);
		while (true) {
			var child = parse(element);
			if (!child) {
				return element;
			}
			element.push(child);
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

	function parseString(parent) {
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
			var element = new Element(parent);
			element.value = str;
			element.dollared = dollared;
			element.quoted = quoted;
			return element;
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
			var element = new Element(parent);
			element.value = str;
			element.code = true;
			return element;
		}
		while (text.length > input &&
			!isSpace(text[input]) &&
			text[input] != ')' &&
			text[input] != '(') {
			input++;
		}
		var element = new Element(parent);
		element.value = text.substring(start, input);
		element.dollared = dollared;
		return element;
	}

	function parse(parent) {
		skipWhitespace();

		if (text.length === input || text[input] === ')')
			return null;

		if (text[input] === '(') {
			input++;
			var child = parseInnerList(parent);
			skipWhitespace();
			assert(text[input] === ')', 'inner list ends with a )');
			input++;
			return child;
		}

		return parseString(parent);
	}

	var root = null;
	while (!root) { // Keep parsing until we pass an initial comment.
		root = parseInnerList(null);
	}
	return root;
}

function compile(ref, node, i) {
	if (node.isList()) {
		return `${ref}.isList() && (${compileList(ref, node)})`;
	} else if (node.value === "*") {
		return `true`;
	} else if (node.code) {
		if (node.value[0] == "/") {
			return node.value + `.test((${ref}[${i}]).value)`;
		}
		return node.value.replace(/\$/g, function () {
			if (i === undefined) {
				return `(${ref})`;	
			}
			return `(${ref}[${i}])`;
		}); 
	} else if (i === undefined) {
		return `${ref}.value === "${node.value}"`;
	} else {
		return `${ref}[${i}].value === "${node.value}"`;
	}
}

function compileList(ref, list) {
	return Array.prototype.map.call(list, function (child, i) {
		if (child.isList()) {
			var childRef = ref + "$";
			return `(${childRef} = ${ref}[${i}], ${compile(childRef, child, i)})`;
		}
		return compile(ref, child, i);
	}).join(" && ");
}
