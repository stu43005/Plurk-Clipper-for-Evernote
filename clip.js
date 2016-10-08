var Clip = function(pid, pop, noteStore, token) {
	this.pid = pid;
	this.popWindow = pop;
	this.noteStore = noteStore;
	this.token = token;
	this.asyncCount = 0;

	var self = this;
	this.vue = new Vue({
		el: '#' + pop.id,
		data: {
			show: false,
			saving: false,
			title: "",
			nbSelected: null,
			notebooks: [],
			tagInput: "",
			tTag: [],
			accTags: [],
			comments: "",
			preview: "",
			error: "",
		},
		methods: {
			closeWindow: function() {
				self.popWindow.close();
			},
			saveToEvernote: function() {
				self.saveToEvernote();
			},
			nbRefreshNotebooks: function() {
				this.show = false;
				self.loadNotebooks();
			},
			addTag: function() {
				var tag = this.accTags.find((t) => t.name == this.tagInput);
				if (!tag) {
					tag = this.tagInput;
				}
				var exist = this.tTag.find((t) => t == tag || t.name == tag);
				if (!exist) {
					this.tTag.push(tag);
				}
				this.tagInput = "";
			},
			deleteTag: function(tag) {
				var i = this.tTag.indexOf(tag);
				this.tTag.splice(i, 1);
			},
		}
	});

	this.loadNotebooks();
	this.renderPreview();
};

Clip.prototype.loadNotebooks = function() {
	var self = this;
	// console.log(this.noteStore, this.token);

	this.asyncCount++;
	this.noteStore.listNotebooks(this.token, function(notebooks) {
		var list = [];
		var stacks = {};
		for (var i = 0; i < notebooks.length; i++) {
			if (notebooks[i].stack == null) {
				list.push(notebooks[i]);
			} else {
				if (!(notebooks[i].stack in stacks)) {
					stacks[notebooks[i].stack] = {
						stack: notebooks[i].stack,
						list: []
					};
				}
				stacks[notebooks[i].stack].list.push(notebooks[i]);
			}
			if (notebooks[i].defaultNotebook) {
				self.vue.nbSelected = notebooks[i];
			}
		}
		// console.log("notebooks", notebooks, list);
		self.vue.notebooks = list;
		self.asyncCount--;
		self.show();
	}, function(error) {
		console.error(error);
	});

	this.asyncCount++;
	this.noteStore.listTags(this.token, function(tags) {
		// console.log("tags", tags);
		self.vue.accTags = tags;
		self.asyncCount--;
		self.show();
	}, function(error) {
		console.error(error);
	});
};

Clip.prototype.show = function() {
	if (this.asyncCount < 1) {
		this.vue.show = true;
		this.popWindow.layout(true);
	}
};

Clip.prototype.renderPreview = function() {
	var self = this;
	this.asyncCount++;

	var plurk = app.localScript(function(args) {
		for (var i = 0; i < TimeLine.plurks.length; i++) {
			if (TimeLine.plurks[i].id == args.pid) {
				return TimeLine.plurks[i];
			}
		}
	}, {
		pid: this.pid
	}, true);

	var user = plurk.then(function(plurk) {
		return app.localScript(function(args) {
			return SiteState.getUserById(args.uid);
		}, {
			uid: plurk.owner_id
		}, true);
	});

	var tmpl = app.getTmpl("plurk_template.html");

	var responses = new Promise(function(resolve, reject) {
		$.ajax({
			url: "https://www.plurk.com/Responses/get2",
			type: "POST",
			data: {
				plurk_id: self.pid,
				from_response: 0
			}
		}).done(function(data) {
			var response = JSON.parse(data.replace(/new\sDate\(([^\(\)]+)\)/ig, "$1"));
			resolve(response);
		}).fail(reject);
	});

	return Promise.all([plurk, user, tmpl, responses]).then(function(d) {
		var [plurk, user, tmpl, responses] = d;
		self.vue.title = user.display_name + " " + plurk.content_raw.substr(0, 40) + " - #" + plurk.id.toString(36) + " - Plurk";
		plurk.content = self.clearPlurkContent(plurk.content);
		responses.responses.forEach(function(response) {
			response.content = self.clearPlurkContent(response.content);
		});
		return ejs.render(tmpl, {
			plurk: plurk,
			user: user,
			responses: responses,
		});
	}).then(function(html) {
		self.vue.preview = html;
		self.asyncCount--;
		self.show();
	});
};

Clip.prototype.clearPlurkContent = function(content) {
	// add hashtag link
	if (content.indexOf("#") > -1) {
		var c = /(^|\s|>)#([^\s'"#\(\)<>]+)(?![^<]*<\/a>)/g;
		content = content.replace(c, function(g, f, d) {
			if (d.match(/^\d+$/)) {
				return g;
			}
			var e = "https://www.plurk.com/w/#";
			return f + "<a class='hashtag' target='_blank' href='" + e + d + "'>#" + d + "</a>";
		});
	}
	var tmp = $("<div/>").html(content);
	tmp.find("*").each(function(i) {
		var self = $(this);
		// apply style
		if (self.hasClass("emoticon_my")) {
			self.css({
				"vertical-align": "top",
			});
		}
		if (self.hasClass("ex_link")) {
			self.css({
				"color": "#0435d2",
				"text-decoration": "none",
			});
		}
		if (self.hasClass("pictureservices")) {
			self.css({
				"display": "inline-block",
				"max-width": "505px",
				"overflow": "hidden",
				"padding": "2px",
				"border": "0",
				"vertical-align": "text-top",
				"border": "1px solid #c4c4c4",
				"border-radius": "2px",
				"background": "transparent",
				"cursor": "pointer",
				"margin": "1px 2px 4px 0",
				"position": "relative",
			});
			self.find("img").css({
				"padding": "0",
				"margin": "0",
				"height": "auto",
				"max-width": "500px",
			});
		}
		if (self.hasClass("meta")) {
			self.css({
				"border": "0",
				"cursor": "pointer",
				"display": "block",
				"margin": "1px 4px 4px 0",
				"overflow": "hidden",
				"padding": "2px 4px",
				"position": "relative",
				"color": "#2153d2",
				"background": "rgba(33,83,210,0.04)",
				"border": "rgba(33,83,210,0.08) 1px solid",
			});
			self.find("img").css({
				"border-radius": "2px",
				"float": "left",
				"height": "48px",
				"margin": "0 6px 0 0",
				"max-width": "80px",
				"padding": "1px",
			});
		}
		if (self.hasClass("hashtag")) {
			self.css({
				"border-radius": "4px",
				"color": "#cf682f",
				"font-size": ".9em",
				"margin": "0 .1em",
			});
		}
		// remove class attr
		self.removeAttr("class");
		// remove 'data-' attr
		Object.keys(self.data()).forEach(k => self.removeAttr("data-" + k));
	});
	content = tmp.html();
	content = content.replace(/\<img([^\>]*)\/?\>/g, "<img$1 />");
	content = content.replace(/\<br([^\>]*)\/?\>/g, "<br$1 />");
	return content;
};

Clip.prototype.saveToEvernote = function() {
	var self = this;
	if (this.asyncCount > 0) {
		return;
	}
	this.vue.saving = true;
	var url = "https://www.plurk.com/p/" + this.pid.toString(36);
	return this.makeNote(url, this.vue.title, this.vue.comments + this.vue.preview, this.vue.nbSelected, this.vue.tTag).then(function(note) {
		self.popWindow.close();
	}, function(e) {
		self.vue.error = JSON.stringify(e);
		self.vue.saving = false;
	});
};

Clip.prototype.makeNote = function(noteUrl, noteTitle, noteBody, parentNotebook, tags) {
	var self = this;

	var nBody = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
	nBody += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
	nBody += "<en-note>" + noteBody + "</en-note>";

	// Create note object
	var newNote = new Note();
	newNote.title = noteTitle;
	newNote.content = nBody;

	// parentNotebook is optional; if omitted, default notebook is used
	if (parentNotebook && parentNotebook.guid) {
		newNote.notebookGuid = parentNotebook.guid;
	}

	if (tags instanceof Array && tags.length > 0) {
		newNote.tagNames = [];
		newNote.tagGuids = [];
		for (var i = 0; i < tags.length; i++) {
			if (typeof tags[i] == "string") {
				newNote.tagNames.push(tags[i]);
			} else {
				newNote.tagGuids.push(tags[i].guid);
			}
		}
	}

	var newNoteAttributes = new NoteAttributes();
	newNoteAttributes.sourceURL = noteUrl;
	newNoteAttributes.sourceApplication = chrome.runtime.getManifest().name;

	newNote.attributes = newNoteAttributes;

	// Attempt to create note in Evernote account
	return new Promise(function(resolve, reject) {
		self.noteStore.createNote(self.token, newNote, function(note) {
			resolve(note);
		}, function(error) {
			// Something was wrong with the note data
			// See EDAMErrorCode enumeration for error code explanation
			// http://dev.evernote.com/documentation/reference/Errors.html#Enum_EDAMErrorCode
			reject(error);
		});
	});
};