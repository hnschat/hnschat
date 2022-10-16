var key;
var keys;
var settings = {};

var page;

var tld;
var domains;
var domain;

var started;
var conversations;
var conversation;
var loadingConversations;

var users;

var fetchingMessages;
var loadingMessages;
var messages = [];

var socket;

var timeFormat = "g:i A";
var dateFormat = "F jS Y";

var replying;
var imTyping;
var typingDelay = 2000;
var typingSendDelay = 1000;
var typingSent;
var lastTyped;
var typers = {};

var sync;

var avatars = {};

var unexpandedLinks = [];

let host = window.location.host;
let validDomains = ["https://hnschat", "https://hns.chat"];
var urlAction;

let commands = ["shrug", "me", "slap"];

var actionString = "\x01ACTION ";

var root = document.querySelector(':root');
var css = getComputedStyle($("html")[0]);

var isActive = true;
var notificationSound = new Audio("/assets/sound/pop");

var browser = getBrowser();

var linkRegex = /<(?:(div|a) class=\"(?:inline )?(?:nick|channel|link))(?:.+?)>(?:.+?)<\/(?:div|a)>/;

var emojiCategories = {
	"Search": [],
	"People": ["Smileys & Emotion", "People & Body"],
	"Nature": ["Animals & Nature"],
	"Food": ["Food & Drink"],
	"Activities": ["Activities"],
	"Travel": ["Travel & Places"],
	"Objects": ["Objects"],
	"Symbols": ["Symbols"],
	"Flags": ["Flags"]
}

function isMobile() {
	if ($(".header .left").css("display") === "flex") {
		return true;
	}
	return false;
}

function log(data) {
	console.log(data);
}

function rtrim(str, chr) {
  var rgxtrim = (!chr) ? new RegExp('\\s+$') : new RegExp(chr+'+$');
  return str.replace(rgxtrim, '');
}

function ltrim(str, chr) {
  var rgxtrim = (!chr) ? new RegExp('^\\s+') : new RegExp('^'+chr+'+');
  return str.replace(rgxtrim, '');
}

async function api(data) {
	if (key) {
		data["key"] = key;
	}

	let output = new Promise(resolve => {
		$.post("/api", JSON.stringify(data), (response) => {
			if (response) {
				let json = JSON.parse(response);

				resolve(json);
			}
		});
	});

	return await output;
}

async function upload(data, attachment) {
	let output = new Promise(resolve => {
		$.ajax({
	        url: "/upload",
	        type: "POST",
	        data: data,
	        cache: false,
	        contentType: false,
	        processData: false,
	        beforeSend: (e) => {},
	        xhr: () => {
	            var p = $.ajaxSettings.xhr();
	            p.upload.onprogress = () => {}
				return p;
			},
			success: (response) => {
				let json = JSON.parse(response);

				resolve(json);
			}
	    });
	});

	return await output;
}

function ws(command, body) {
	socket.send(command+" "+JSON.stringify(body))
}

function startSession() {
	if (key) {
		return;
	}

	let data = {
		action: "startSession"
	};

	return api(data);
}

function addDomain(name) {
	let data = {
		action: "addDomain",
		domain: toASCII(name)
	};

	return api(data);
}

function listTLD() {
	let data = {
		action: "listTLD"
	};

	return api(data);
}

function checkTLD(tld) {
	let data = {
		action: "checkTLD",
		tld: toASCII(tld),
	};

	return api(data);
}

function addSLD(sld, tld) {
	let data = {
		action: "addSLD",
		sld: toASCII(sld),
		tld: toASCII(tld)
	};

	if (typeof invite !== "undefined" && invite.length) {
		data["invite"] = invite;
	}

	return api(data);
}

function verifyDomain(domain) {
	let data = {
		action: "verifyDomain",
		domain: domain
	};

	return api(data);
}

function getDomains() {
	let data = {
		action: "getDomains"
	};

	return api(data);
}

function deleteAttachment(id) {
	let data = {
		action: "deleteAttachment",
		id: id
	};

	return api(data);
}

function markConversationUnreadIfNeeded(id) {
	if (id !== conversation) {
		let data = conversations[id];
		if (data.unreadMessages) {
			$("#conversations tr[data-id="+id+"]").addClass("unread");
		}
		if (data.unreadMentions) {
			$("#conversations tr[data-id="+id+"]").addClass("mentions");
		}
	}

	updateMessageTabs();
}

function updateSearchView() {
	if ($("#users .title .searching").is(":visible")) {
		$("#users .title .normal").removeClass("hidden");
		$("#users .title .searching").removeClass("shown");
		$("#users #count").removeClass("hidden");

		$("#users input[name=search]").val('');
		updateUsers();
	}
	else {
		$("#users .title .normal").addClass("hidden");
		$("#users .title .searching").addClass("shown");
		$("#users #count").addClass("hidden");
		$("#users input[name=search]").focus();
	}
}

function searchUsers(query) {
	let users = $("#users tr.user");

	$.each(users, (k, user) => {
		let match = Array.from(toUnicode($(user).data("name").toString())).slice(0, Array.from(query).length).join("").toLowerCase();
		let search = query.toLowerCase();

		if (match == search) {
			$(user).removeClass("hidden");
		}
		else {
			$(user).addClass("hidden");
		}
	});
}

function insertConversations() {
	let sortedArray = Object.entries(conversations).sort((a,b) => {
		if (a[1]["latestMessage"].time > b[1]["latestMessage"].time) {
			return -1;
		}
		return 1;
	});

	var sortedObject = {};
	$(sortedArray).each((k, conversation) => {
		sortedObject[conversation[0]] = conversation[1];
	});

	conversations = sortedObject;

	$("#conversations .section table").empty();
	$.each(conversations, (k, conversation) => {
		if (isGroup(k)) {
			let name = conversation.name;
			$("#conversations .channels table").append(conversationRow(k, name));
		}
		else {
			let user = Object.keys(conversation.users).filter(user => {
				return user !== domain;
			}).join(", ");
			let name = conversation.users[user];
			$("#conversations .private table").append(conversationRow(k, name));
			updateAvatars();
		}

		decryptConversationSubtitle(k);
		markConversationUnreadIfNeeded(k);
	});

	if (conversation) {
		activeConversation(conversation);
	}
	else {
		if (Object.keys(conversations).length) {
			inputEnabled(true);
			activeConversation(Object.keys(conversations)[0]);
		}
		else {
			inputEnabled(false, "empty");
		}
	}

	onLoadAction(urlAction);
}

function toASCII(string) {
	var ascii = nameToAscii(string);
	return ascii;
}

function toUnicode(string) {
	var unicode = punycode.ToUnicode(string);
	unicode = nameToUnicode(unicode);

	return unicode;
}

function updateConversation(body) {
	let conversation = body.conversation;
	let latestMessage = conversations[conversation].latestMessage;

	let row = $("#conversations .section table tr[data-id="+conversation+"]");
	if (row) {
		let parent = row.parent();
		row.remove();
		let sub = row.find(".subtitle");

		var name;
		if (isGroup(conversation)) {
			name = toUnicode(nameForUserID(latestMessage.user).domain);
		}
		else {
			name = toUnicode(conversations[conversation].users[latestMessage.user].domain);
		}

		let message = latestMessage.message;
		let subtitle = name+'<span class="decrypt">'+message+'</span>';
		sub.html(subtitle);
		parent.prepend(row);
	}

	decryptConversationSubtitle(conversation);
	markConversationUnreadIfNeeded(conversation);
}

function updateUsers() {
	if ($("#users .searching.shown").length) {
		return;
	}

	$(".users table").empty();

	if (!isGroup(conversation)) {
		return;
	}

	var unlocked = [];
	let conversationUsers = conversations[conversation].users;
	$.each(Object.keys(conversationUsers), (k, id) => {
		let filtered = users.filter(u => {
			return u.id == id;
		});

		if (filtered.length) {
			if (!filtered[0].locked) {
				let firstUser = filtered[0];
				conversations[conversation].users[firstUser.id] = { domain: firstUser.domain };
				
				let theUser = {
					id: firstUser.id,
					domain: firstUser.domain
				};
				unlocked.push(theUser);
			}
		}
	});
	
	$.each(unlocked, (k, user) => {
		let row = userRow(user);
		$(".users table").append(row);
	});

	$("#users #count").html(unlocked.length.toLocaleString("en-US"));

	updateAvatars();
}

function updateAvatars() {
	$.each($(".favicon:not(.loaded)"), (k, e) => {
		let favicon = $(e);
		favicon.addClass("loaded");
		let d = favicon.data("domain");
		let id = favicon.data("id");
		let user = nameForUserID(id);

		if (user.id) {
			if (Object.keys(avatars).includes(id)) {
				if (avatars[id]) {
					let original = $("#avatars .favicon[data-id="+id+"]");
					if (original.length) {
						let clone = original[0].cloneNode(true);
						let parent = favicon.parent();
						favicon.remove();
						parent.append(clone);
						parent.find(".fallback").html('');
						updateOtherAvatars(id);
					}
				}
			}
			else {
				avatars[id] = false;
				var link = user.avatar;
				if (link) {
					link = "/avatar/"+user.id;
					let img = $('<img class="loading" />');
					img.attr("src", link).on("load", i => {
						let im = $(i.target);
						favicon.css("background-image", "url("+link+")");
						favicon.parent().find(".fallback").html('');
						im.remove();
						avatars[id] = link;
						let clone = favicon[0].cloneNode(true);
						$("#avatars").append(clone);
						updateOtherAvatars(user.id);
					}).on("error", r => {
						$(r.target).remove();
						avatars[id] = false;
					});  
					$("html").append(img);
				}
				else {
					avatars[id] = false;
				}
			}
		}
	});
}

function updateOtherAvatars(id) {
	if (avatars[id]) {
		let avatars = [
			$("#conversations .section.private .avatar .favicon[data-id="+id+"].loaded"),
			$("#messages .messageRow .avatar .favicon[data-id="+id+"].loaded"),
			$("#users .user .avatar .favicon[data-id="+id+"].loaded")
		];

		$.each(avatars, (k, avatar) => {
			if (avatar.length) {
				if (avatar.css("background-image") === "none" || !avatar.css("background-image")) {
					let original = $("#avatars .favicon[data-id="+id+"]");
					if (original.length) {
						let clone = original[0].cloneNode(true);
						let parent = avatar.parent();
						avatar.remove();
						parent.append(clone);
						parent.find(".fallback").html('');
					}
				}
			}
		});
	}
}

async function makeSecret(k) {
	let derivedKey = new Promise(resolve => {
		let otherUser = getOtherUser(k);
		let otherKey = JSON.parse(otherUser.pubkey);

		if (otherKey) {
			deriveKey(otherKey, keys.privateKeyJwk).then(d => {
				conversations[k].key = d;
				decryptConversationSubtitle(k);
				resolve(d);
			});
		}
		else {
			resolve();
		}
	}); 

	return await derivedKey;
}

function getUsers() {
	let data = {
		action: "getUsers"
	};

	return api(data);
}

function loadConversations() {
	loadingConversations = true;
	getConversations(domain).then(r => {
		conversation = null;

		$("#messages").empty();
		$(".messageHeader table").empty();
		$("#conversations .private table").empty();

		if (r.success) {
			conversations = r.conversations

			conversation = Object.keys(conversations).filter(c => {
			    return conversations[c].group && conversations[c].name === "general";
			});
			updateUsers();

			if (Object.keys(conversations).includes(localStorage.conversation)) {
				conversation = localStorage.conversation;
			}
			else {
				localStorage.setItem("conversation", conversation);
			}

			messageTabForConversation(conversation);

			setupConversations().then(() => {
				insertConversations();
			});
		}
		loadingConversations = false;
	});
}

async function setupConversations() {
	var ready = 0;

	let pm = Object.keys(conversations).filter(c => {
		return !conversations[c].group;
	});

	let output = new Promise(resolve => {
		$.each(conversations, (k, c) => {
			if (!c.group) {
				makeSecret(k).then(() => {
					ready += 1;
					if (k == conversation) {
						loadMessages(conversation);
					}

					if (ready == pm.length) {
						resolve();
					}
				})
			}
			else {
				if (k == conversation) {
					updateUsers();
					loadMessages(conversation);
				}

				if (ready == pm.length) {
					resolve();
				}
			}
		});
	});
	
	return await output;
}

function getConversations(domain) {
	let data = {
		action: "getConversations",
		domain: domain
	};

	return api(data);
}

function loadMessages(conversation, options={}) {
	fetchingMessages = true;
	getMessages(conversation, options).then(r => {
		$("#chats .content .needSLD").remove();

		fetchingMessages = false;
		if (r.success) {
			var before = false;
			if (options.before) {
				before = true;
			}

			let msgs = r.messages;
			loadingMessages = msgs.length;
			$.each(msgs, (k, message) => {
				prepareMessage(message, true, before);
			});

			if (!before) {
				fixScroll();
			}

			conversations[conversation].unreadMessages = 0;
			conversations[conversation].unreadMentions = 0;
		}
		else {
			let needSLD = $('<div class="needSLD" />');
			let needMessage = $('<span />');
			let button = $('<div class="button" />');
			let tld = toUnicode(conversations[conversation].name);
			var buttons = [];

			var message = "";
			let output = new Promise(resolve => {
				if (r.unverified) {
					message = "You need to verify your name to chat here.";
					button.attr("data-action", "verifyName");
					button.html("Verify my name");

					resolve();
				}
				else if (r.needSLD) {
					message = "#"+tld+" is a private community for owners of a ."+tld+" only.";

					checkTLD(tld).then(r => {
						var msg = "";
						if (r.success) {
							if (r.free) {
								msg = "Create a free .";
								button.attr("data-action", "createSLD");
							}
							else if (r.purchase) {
								msg = "Purchase a .";
								button.attr("data-action", "purchaseSLD");
								button.attr("data-registrar", r.registrar);
							}

							if (r.owned) {
								$.each(r.owned, (k,o) => {
									let button = $('<div class="button" />');
									let name = toUnicode(nameForUserID(o).domain);
									button.html("Switch to "+name);
									button.attr("data-id", o);
									button.attr("data-action", "switchName");
									buttons.push(button);
								});
							}

							if (msg.length) {
								button.html(msg+tld);
								button.attr("data-tld", tld);
							}
						}
						resolve();
					});
				}
			});

			output.then(() => {
				if (message.length) {
					needMessage.html(message);
					needSLD.append(needMessage);

					if (button.html().length) {
						needSLD.append(button);
					}

					if (buttons.length) {
						$.each(buttons, (k, b) => {
							needSLD.append(b);
						});
					}

					$("#chats .content .needSLD").remove();
					$("#chats .content").append(needSLD);
				}
			});
		}

		showChat(true);
	});
}

function getMessages(conversation, options) {
	let data = {
		action: "getMessages",
		conversation: conversation,
		domain: domain
	};

	$.each(options, (k, v) => {
		data[k] = v;
	});

	return api(data);
}

function fixScroll(before=false, row=false) {
	var fix = false;
	switch (browser) {
		case "safari":
			fix = true;
			break;

		default:
			break;
	}

	if (fix && !before) {
		let messageHolder = $("#messageHolder");
		let scrollTop = messageHolder[0].scrollTop;

		if (!scrollTop) {
			messageHolder.scrollTop(-1);
			messageHolder.scrollTop(0);
		}
	}
}

function isCharEmoji(char) {
	if (char == "\u200d") {
		return true;
	}

	let match = emojis.filter(emoji => {
		return emoji.emoji == char || emoji.emoji.replace("\ufe0f", "") == char;
	});

	if (match.length) {
		return true;
	}

	return false;
}

function setContextMenuPosition(menu, e) {
	var hx = window.innerWidth / 2;
	var hy = window.innerHeight / 2;
	var x = e.clientX;
	var y = e.clientY;

	if (x >= hx) {
		x = e.clientX - menu.outerWidth();
	}
	if (y >= hy) {
		y = e.clientY - menu.outerHeight();
	}

	menu.css({ top: y, left: x });
}

function setupEmojiView(e, sender) {
	let menu = $(".popover[data-name=emojis]");

	if (sender === "message") {
		let target = $(e.currentTarget);
		let row = target.closest(".messageRow");

		if (!row.length) {
			let id = target.closest(".body").find("span.message").data("id");
			row = $("#messages").find(".messageRow[data-id="+id+"]");
		}

		let hover = row.find(".hover");
		hover.addClass("visible");
		menu.addClass("react");
		setContextMenuPosition(menu, e);
	}
	else {
		menu.removeClass("react");
		menu.css({ top: "auto", left: "10px" });
	}

	if (!menu.hasClass("loaded")) {
		menu.attr("data-sender", sender);

		$.each(Object.keys(emojiCategories), (k, category) => {
			let section = $('<div class="section" />');
			let title = $('<div class="subtitle" />')
			let emojis = $('<div class="emojis" />')

			section.attr("data-name", category);
			title.html(category);

			section.append(title);
			section.append(emojis);

			if (k == 0) {
				section.addClass("hidden");
				title.addClass("hidden");
			}
			
			menu.find(".body .grid").append(section);
		});

		$.each(emojis, (k, emoji) => {
			let cat = categoryForEmoji(emoji);
			let item = $('<div class="emoji" />');
			item.attr("data-aliases", JSON.stringify(emoji.aliases));
			item.html(emoji.emoji);
			menu.find(".body .grid .section[data-name="+cat+"] .emojis").append(item);
		});

		menu.addClass("loaded");
	}
}

function decodeEntities(encodedString) {
	var textArea = document.createElement('textarea');
	textArea.innerHTML = encodedString;
	return textArea.value;
}

function nameForUserInConversation(conversation, user) {
	var name = "";
	if (isGroup(conversation)) {
		name = toUnicode(nameForUserID(user).domain);
	}
	else {
		name = toUnicode(conversations[conversation].users[user].domain);
	}

	return name;
}

function replaceIds(message, link=true) {
	var output = message;

	let r = new regex(/\@(?<name>[a-zA-Z0-9]{16})/, 'gm');
	var matches = output.matchAll(r).reverse();
	$.each(matches, (k, m) => {
		var id = m.groups.name;
		var start = m.index;
		var end = m.index + id.length + 1;

		if (nameForUserID(id)) {
			let name = toUnicode(nameForUserID(id).domain);

			var replace = '@'+name+'/';
			if (link) {
				replace = '<div class="inline nick">@'+name+'/</div>';
			}

			output = replaceRange(output, start, end, replace);
		}
	});

	return output;
}

function replaceNames(message) {
	var output = message;

	let r = new RegExp(`\@(?<name>[^ ]+?\/)`);
	while ((result = r.exec(output)) !== null) {
		var name = result.groups.name;
		var start = result.index;
		var end = (result.index + name.length + 1);

		let filtered = users.filter(user => {
			return toUnicode(user.domain) == rtrim(name, "/") && !user.locked;
		});

		if (filtered) {
			let id = filtered[0].id;
			
			let replace = "@"+id;
			output = replaceRange(output, start, end, replace);
		}
	}

	return output;
}

async function messageBody(message) {
	let output = new Promise(resolve => {
		if (isGroup(message.conversation)) {
			resolve(message.message.trim());
		}
		else {
			let dkey = conversations[message.conversation].key;
			decryptMessage(message.message, dkey, message.conversation).then(decoded => {
				resolve(decoded.trim());
			});
		}
	});

	return await output;
}

function prepareMessage(message, old=true, before=false) {	
	messageBody(message).then(theMessage => {
		var push = false;

		message.reactions = JSON.parse(message.reactions);

		if (before) {
			messages.unshift(message);
		}
		else {
			messages.push(message);
		}

		let messageDate = new Date(message.time * 1000).format(dateFormat);
		let messageTime = new Date(message.time * 1000).format(timeFormat);
		var messageSender = "";
		if (message.from) {
			messageSender = message.from;
		}
		else if (message.user) {
			messageSender = message.user;
		}

		let messageUser = nameForUserInConversation(message.conversation, messageSender);

		if (fetchingMessages) {
			return;
		}

		if (message.conversation == conversation) {
			insertMessage(message, theMessage, before, messageSender, messageUser, messageDate, messageTime);

			if (!isActive) {
				push = true;
			}
		}
		else {
			push = true;
		}

		if (!old && push && messageSender !== domain) {
			var replaced = replaceIds(theMessage, false);
			if (!isGroup(message.conversation)) {
				sendNotification(messageUser, replaced, message.conversation);
			}
			else if (theMessage.includes("@"+domain)) {
				sendNotification(messageUser+" - #"+conversations[message.conversation].name, replaced, message.conversation);
			}
		}
	});
}

function insertMessage(message, theMessage, before, messageSender, messageUser, messageDate, messageTime) {
	let existingMessage = $("#messages > .messageRow[data-id="+message.id+"]");
	if (existingMessage.length) {
		return;
	}

	let messageHolder = $("#messages");

	var messageRow = $('<div class="messageRow" />');
	var contents = $('<div class="contents" />');
	var holder = $('<div class="holder" />');
	var row = $('<div class="message" />');
	var body = $('<div class="body" />');

	var holder2 = $('<div class="holder react" />');
	var reactions = $('<div class="reactions" />');

	var hover = $('<div class="hover" />');

	var actions = $('<div class="actions" />');
	var reply = $('<div class="action icon reply" data-action="reply" />');
	var emoji = $('<div class="action icon emoji" data-action="emojis" />');
	var del = $('<div class="action icon delete" data-action="deleteMessage" />');
	var time = $('<div class="time" />');

	var signature = $('<div class="signature" />');
	var user = $('<div class="user" />');
	var lastUser = $('<div class="user" />');
	time.html(messageTime);
	user.html(messageUser+"/");
	messageRow.attr("data-id", message.id);
	messageRow.attr("data-time", message.time);
	messageRow.attr("data-sender", messageSender);
	messageRow.attr("title", messageDate);
	if (messageSender == domain || message.user == domain) {
		messageRow.addClass("self");
	}

	if (message.replying) {
		messageRow.addClass("replying");

		let reply = $('<div class="reply" />');
		let replyLine = $('<div class="line" />');
		let replyContents = $('<div class="contents" />');
		let replyUser = $('<div class="user" />');
		let replyBody = $('<div class="body" />');

		if (domain == message.replying.user) {
			messageRow.addClass("mention");
		}

		let replyUserName = nameForUserInConversation(message.conversation, message.replying.user);
		replyUser.html(replyUserName+"/");

		messageBody(message.replying).then(replyMessage => {
			var replyMsg = decodeEntities(decodeEntities(replyMessage));
			replyMsg = replaceIds(replyMsg, false);
			replyMsg = replaceSpecialMessages(replyMsg, false);
			replyBody.attr("title", replyMsg);
			replyBody.html(htmlEntities(replyMsg));

			if (isAction(replyMessage)) {
				replyBody.addClass("action");
			}

			replyContents.prepend(replyUser);
			replyContents.append(replyBody);
			reply.append(replyLine);
			reply.append(replyContents);
			messageRow.prepend(reply);
		});
	}

	if (isAction(theMessage)) {
		messageRow.addClass("action");

		theMessage = theMessage.substring(8);
	}

	var emojiMsg = decodeEntities(decodeEntities(theMessage));
	let charArray = Array.from(emojiMsg);
	let firstThree = charArray.slice(0, 3);
	var isEmojis = true;
	$.each(firstThree, (k, char) => {
		if (!isCharEmoji(char)) {
			isEmojis = false;
		}
	});
	if (isEmojis) {
		messageRow.addClass("emojis");
	}

	if (message.signature && !message.signed) {
		row.addClass("signed fail");
		row.attr("data-signature", message.signature);
		signature.html(message.signature);
	}
	else if (message.signed) {
		row.addClass("signed");
		row.attr("data-signature", message.signature);
		signature.html(message.signature);
	}

	var attachment = false;
	try {
		let decoded = decodeEntities(decodeEntities(theMessage));
		let json = JSON.parse(decoded);
		
		if (json.hnschat) {
			if (json.attachment) {
				attachment = true;
				let link = "https://"+host+"/uploads/"+json.attachment;
				let a = $("<a />");
				a.attr("href", link);
				a.attr("target", "_blank");
				let image = $('<img />');
				image.attr("src", link);
				a.append(image);
				body.append(a);
				row.addClass("image");
			}
			else if (json.payment) {
				attachment = true;

				let link = "/assets/img/icon-512x512";
				let txLink = "https://niami.io/tx/"+json.payment;
				let a = $("<a />");
				a.attr("href", txLink);
				a.attr("target", "_blank");
				let image = $('<img />');
				image.attr("src", link);
				
				let holder = $('<div class="imageHolder" />');
				holder.append(image);

				let txMessage = $('<div class="amount" />');
				txMessage.html(rtrim(json.amount.toLocaleString("en-US", { minimumFractionDigits: 6 }), "0"));
				holder.append(txMessage);

				let content = $('<div class="txMessage" />');
				content.html("You've received a payment. Click for transaction details.");
				holder.append(content);

				a.append(holder);
				body.append(a);
				row.addClass("image payment");
			}
		}
	}
	catch (error) {}

	if (!attachment) {
		if (isGroup(message.conversation)) {
			body.html(theMessage);
		}
		else {
			body.html(htmlEntities(htmlEntities(theMessage)));
		}
	}

	actions.append(reply);
	actions.append(emoji);

	row.append(body);
	row.append(signature);

	holder.append(row);
	holder2.append(reactions);

	hover.append(time);
	hover.append(actions);
	if (messageRow.hasClass("self")) {
		holder.prepend(hover);
	}
	else {
		holder.append(hover);
	}
	contents.append(holder);
	contents.append(holder2);

	if (before) {
		before = {
			oldHeight: messageHolder[0].scrollHeight,
			oldPosition: messageHolder[0].scrollTop
		}
		messageHolder.prepend(messageRow);
	}
	else {
		messageHolder.append(messageRow);
	}

	if (message.firstMessage) {
		var infoRow = $('<div class="messageRow informational date last" />');
		infoRow.html(messageDate);
		messageHolder.prepend(infoRow);
		contents.prepend(user);
		contents.prepend(messageAvatar(messageSender, messageUser));
		stylizeMessage(infoRow);
	}

	messageRow.append(contents);

	fixScroll(before, messageRow);

	setTimeout(() => {
		loadingMessages -= 1;
	}, 1);

	if (!attachment) {
		linkifyMessage(body);
	}

	let msg = messages.filter(m => {
		return message.id == m.id;
	});
	if (msg.length) {
		updateReactions(msg[0]);
	}

	stylizeMessage(messageRow);
	updateAvatars();
}

function stylizeMessage(message) {
	let messageHolder = $("#messages");

	let firstMessage = $("#messages > .messageRow[data-id]").first();
	let firstMessageID = firstMessage.data("id");

	let lastMessage = $("#messages > .messageRow[data-id]").last();
	let lastMessageID = lastMessage.data("id");

	let messageID = message.data("id");
	let messageTime = message.data("time");
	let messageDate = new Date(messageTime * 1000).format(dateFormat);
	let contents = message.find(".contents");
	let messageSender = message.data("sender");
	var messageUser;

	let previousMessage = message.prev();
	let previousMessageTime = previousMessage.data("time");
	let previousMessageDate = new Date(previousMessageTime * 1000).format(dateFormat);
	let previousMessageSender = previousMessage.data("sender");

	let nextMessage = message.next();
	let nextMessageTime = nextMessage.data("time");
	let nextMessageDate = new Date(nextMessageTime * 1000).format(dateFormat);
	let nextMessageSender = nextMessage.data("sender");
	var nextMessageUser;

	var isFirst = false;
	var isLast = false;

	var isReply = false;

	var isInformational = false;
	var isAction = false;
	var isDate = false;

	var before = false;

	var addUser = false;
	var addNextUser = false;
	var removeUser = false;
	var removeNextUser = false;
	
	var prependDate = false;
	var appendDate = false;

	if (firstMessageID == messageID) {
		isFirst = true;
	}

	if (lastMessageID == messageID) {
		isLast = true;
	}

	if (message.hasClass("replying")) {
		isReply = true;
	}

	if (message.hasClass("informational")) {
		isInformational = true;
	}

	if (message.hasClass("date")) {
		isDate = true;
	}

	if (message.hasClass("action")) {
		isAction = true;
	}

	if (nextMessage.length) {
		before = true;
	}

	if (isFirst || isReply) {
		addUser = true;
	}

	if (!before) {
		if (!isDate && previousMessage.length && messageDate !== previousMessageDate && !previousMessage.hasClass("date")) {
			prependDate = true;
		}
	}
	else {
		if (!isDate && nextMessage.length && messageDate !== nextMessageDate && !nextMessage.hasClass("date")) {
			appendDate = true;
		}
	}

	if (isDate) {
		previousMessage.addClass("last");
		message.addClass("first last");

		if (nextMessage.length) {
			addNextUser = true;
		}
	}
	else {
		var timeDifference;

		messageUser = nameForUserInConversation(conversation, messageSender);

		if (before) {
			message.addClass("first");
		}
		else {
			message.addClass("last");	
		}

		if (isFirst || isReply) {
			message.addClass("first");
		}

		if (isLast) {
			message.addClass("last");
		}

		if (previousMessage.length) {
			timeDifference = messageTime - previousMessageTime;

			if (timeDifference > 60 || previousMessageSender !== messageSender) {
				previousMessage.addClass("last");
				message.addClass("first");
				addUser = true;
			}
			else if (!isReply) {
				removeUser = true;
			}
		}

		if (timeDifference < 60 && previousMessageSender == messageSender && !message.hasClass("replying")) {
			previousMessage.removeClass("last");
		}

		if (previousMessageSender !== messageSender) {
			previousMessage.addClass("last");
		}

		if (nextMessage.length) {
			timeDifference = nextMessageTime - messageTime;

			if (timeDifference > 60) {
				nextMessage.addClass("first");
				addNextUser = true;
			}

			if (nextMessage.hasClass("first")) {
				message.addClass("last");
			}
		}

		if (timeDifference < 60 && nextMessageSender == messageSender && !nextMessage.hasClass("replying")) {
			removeNextUser = true;
		}

		if (addUser) {
			if (!contents.find(".user").length) {
				var user = $('<div class="user" />');
				user.html(messageUser+"/");
				contents.prepend(user);
				contents.prepend(messageAvatar(messageSender, messageUser));
			}
		}
		if (removeUser) {
			message.removeClass("first");
			message.find(".contents .user").remove();
			message.find(".contents .avatar").remove();
		}
		if (removeNextUser) {
			message.removeClass("last");
			nextMessage.removeClass("first");
			nextMessage.find(".contents .user").remove();
			nextMessage.find(".contents .avatar").remove();
		}
		if (prependDate) {
			var infoRow = $('<div class="messageRow informational date last" />');
			infoRow.html(messageDate);
			infoRow.insertBefore(message);
			stylizeMessage(infoRow);
		}
		if (appendDate) {
			var infoRow = $('<div class="messageRow informational date last" />');
			infoRow.html(nextMessageDate);
			infoRow.insertAfter(message);
			stylizeMessage(infoRow);
		}
	}

	if (addNextUser) {
		if (!nextMessage.find(".contents .user").length) {
			nextMessageUser = nameForUserInConversation(conversation, nextMessageSender);
			var user = $('<div class="user" />');
			user.html(nextMessageUser+"/");
			nextMessage.addClass("first");
			nextMessage.find(".contents").prepend(user);
			nextMessage.find(".contents").prepend(messageAvatar(nextMessageSender, nextMessageUser));
		}
	}

	updateAvatars();
}

function replaceRange(s, start, end, substitute) {
	var before = s.substr(0, start);
	var after = s.substr(end, (s.length -end));

	return before+substitute+after;
}

class regex extends RegExp {
	[Symbol.matchAll](str) {
		const result = RegExp.prototype[Symbol.matchAll].call(this, str);
		if (!result) {
			return null;
		}
		return Array.from(result);
	}
}

function isIn(type, string, index, length) {
	var result = false;

	switch (type) {
		case "link":
			var isInRegex = new regex(linkRegex, 'gim');
			break;
	}

	var matches = string.matchAll(isInRegex).reverse();
	$.each(matches, (k, m) => {
		var link = m[0];
		var start = m.index;
		var end = m.index + link.length;
		
		if (index >= start && index < end) {
			result = true;
		}
	});

	return result;
}

function mentionsMe(message) {
	var output = false;

	let r = new regex(/\@(?<name>[a-zA-Z0-9]{16})/, 'gm');
	var matches = message.matchAll(r);
	$.each(matches, (k, m) => {
		if (domain == m.groups.name) {
			output = true;
		}
	});

	return output;
}

function linkifyMessage(element) {
	var output = element.text();
	let links = anchorme.list(output).reverse();

	$.each(links, (k, link) => {
		var href = link.string;

		if (link.isEmail) {
			href = "mailto:"+href;
		}
		else if (link.isURL && href.substring(0, 8) !== "https://" && href.substring(0, 7) !== "http://") {
			href = "http://"+href;
		}

		let replace = '<a class="inline link" href="'+href+'" target="_blank">'+link.string+'</a>';
		output = replaceRange(output, link.start, link.end, replace);
	});

	let isMention = mentionsMe(output);
	if (isMention) {
		element.closest(".messageRow").addClass("mention");
	}

	output = replaceIds(output);

	element.html(output);
	expandLinks(element);
}

function expandLinks(element) {
	let messageRow = element.parent();
	let links = element.find("a.inline");

	if (links.length) {
		let link = links[0].href;
		
		let data = {
			action: "getMetaTags",
			url: link
		}

		api(data).then(r => {
			if (r.tags && Object.keys(r.tags).length) {
				if (Object.keys(r.tags).includes("title")) {
					let a = $('<a href="'+link+'" target="_blank" />');
					let div = $('<div class="preview" />');
					let image = $('<img class="image" />');
					let title = $('<div class="title" />');
					let subtitle = $('<div class="subtitle" />');

					if (Object.keys(r.tags).includes("image")) {
						if (r.tags.image.length) {
							image.attr("src", decodeEntities(decodeEntities(r.tags.image)));
							div.append(image);
						}
					}

					if (r.tags.title.length) {
						title.text(decodeEntities(decodeEntities(r.tags.title)));
						div.append(title);
					}

					if (Object.keys(r.tags).includes("description")) {
						if (r.tags.description.length) {
							subtitle.text(decodeEntities(decodeEntities(r.tags.description)));
							div.append(subtitle);
						}
					}

					if (div.html().length) {
						a.append(div);
						messageRow.append(a);
						fixScroll();
					}
				}
			}
			else {
				if (!unexpandedLinks.includes(element)) {
					unexpandedLinks.push(element);

					setTimeout(() => {
						expandLinks(element);
					}, 1000)
					
				}
			}
		});
	}
}

function checkName(from, to) {
	let data = {
		action: "checkName",
		from: domain,
		domain: to
	};

	return api(data);
}

async function encryptIfNeeded(conversation, message, dkey) {
	let output = new Promise(resolve => {
		if (dkey) {
			encryptMessage(message, dkey, conversation).then(m => {
				resolve(m);
			});
		}
		else {
			resolve(message);
		}
	});

	return await output;
}

function sendMessage(conversation, message, signature=false) {
	let dkey = conversations[conversation].key || null;

	var theMessage = message;
	if (message[0] === "/") {
		if (message.length > 1 && message[1] !== "/") {
			let stripped = message.substring(1);
			var split = stripped.split(" ");
			let command = split[0];
			split.shift();
			let body = split.join(" ");
			
			switch (command) {
				case "me":
					if (!body.length) {
						return;
					}
					theMessage = actionString+body;
					break;

				case "shrug":
					theMessage = "¯\\_(ツ)_/¯";
					break;

				case "slap":
					if (!body.length) {
						return;
					}

					var who = rtrim(split[0], "[/ ]");
					let filtered = Object.keys(conversations[conversation].users).filter(k => {
						return who.toLowerCase() == nameForUserID(k).domain.toLowerCase();
					});

					if (!filtered.length) {
						return
					}

					who = nameForUserID(filtered[0]).domain;
					theMessage = actionString+"slaps @"+who+"/ around a bit with a large trout";
					break;

				default:
					return;
			}
		}
		else if (message.length > 1 && message[1] == "/") {
			theMessage = theMessage.substring(1);
		}
	}

	theMessage = replaceNames(theMessage);
	encryptIfNeeded(conversation, theMessage, dkey).then(m => {
		let data = {
			action: "sendMessage",
			conversation: conversation,
			from: domain,
			message: m
		};

		if (replying) {
			data["replying"] = replying.message;
			replying = false;
			updateReplying();
		}

		if (signature) {
			data["signature"] = signature;
		}

		imTyping = false;
		ws("ACTION", data);
	});
}

function markSeen(id) {
	let data = {
		action: "markSeen",
		conversation: conversation,
		domain: domain,
		id: id
	}

	ws("ACTION", data);
}

async function createConversation(conversation) {
	conversations[conversation.id] = conversation;
	
	let output = new Promise(resolve => {
		let name = getOtherUser(conversation.id);
		if (name) {
			makeSecret(conversation.id).then(() => {
				$("#conversations .private table tr[data-id="+conversation.id+"]").remove();
				$("#conversations .private table").prepend(conversationRow(conversation.id, name));
				updateAvatars();
				resolve();
			});
		}
		else {
			resolve();
		}
	})

	return await output;
}

function goto(link, open) {
	if (open) {
		window.open(link, '_blank');
	}
	else {
		window.location = link;
	}
}

function sizeInput() {
	if (page == "chat") {
		let input = $(".input textarea");
		input.css("height", "1px");

		var height = input[0].scrollHeight;

		if (height > 200) {
			height = 200;
		}

		input.css("height", height+"px");
	}
}

function inputEnabled(bool, reason=false) {
	var div;

	if (reason) {
		switch (reason) {
			case "locked":
				div = ".locked";
				break;

			case "verify":
				div = ".verify";
				break;

			case "empty":
				div = ".noConversations";
				break;
		}
	}

	if (bool) {
		$(".inputHolder div:not(.input)").removeClass("shown");
		$(".input").removeClass("hidden");
		$(".input #message").attr("disabled", false);

		if (!isMobile() || (isMobile() && !$("#conversations.showing").length)) {
			if (!$(".popover.shown").length) {
				$(".input #message").focus();
			}
		}
	}
	else {
		$(".inputHolder div:not(.input)").removeClass("shown");
		$(".input #message").attr("disabled", true);
		$(".input").addClass("hidden");
		$(".inputHolder "+div).addClass("shown");
	}
}

function updateActiveConversation(id) {
	$("#conversations tr.active").removeClass("active");
	$("#conversations tr[data-id="+id+"]").addClass("active");
}

function messageTabForConversation(id) {
	if (isGroup(id)) {
		switchMessageTab("channels");
	}
	else {
		switchMessageTab("private");
	}
}

function switchMessageTab(tab) {
	$("#conversations .sections .section").removeClass("shown");
	$("#conversations .tabs .tab").removeClass("active");
	$("#conversations .sections .section."+tab).addClass("shown");
	$("#conversations .tabs .tab[data-tab="+tab+"]").addClass("active");
}

function updateMessageTabs() {
	let unreadMentions = $("#conversations .section.channels tr.unread.mentions");
	var mentionCount = 0;
	$.each(unreadMentions, (k, chat) => {
		if ($(chat).data("id") !== conversation) {
			mentionCount += 1;
		}
	});

	let unreadPrivate = $("#conversations .section.private tr.unread");
	var privateCount = 0;
	$.each(unreadPrivate, (k, chat) => {
		if ($(chat).data("id") !== conversation) {
			privateCount += 1;
		}
	});

	if (mentionCount) {
		$("#conversations .tabs .tab[data-tab=channels]").addClass("notification");
	}
	else {
		$("#conversations .tabs .tab[data-tab=channels]").removeClass("notification");
	}

	if (privateCount) {
		$("#conversations .tabs .tab[data-tab=private]").addClass("notification");
	}
	else {
		$("#conversations .tabs .tab[data-tab=private]").removeClass("notification");
	}

	if (mentionCount || privateCount) {
		$(".header .left").addClass("notification");
	}
	else {
		$(".header .left").removeClass("notification");
	}
}

function activeConversation(id){
	updateActiveConversation(id);

	$("#conversations tr[data-id="+id+"]").removeClass("unread");
	$("#conversations tr[data-id="+id+"]").removeClass("mentions");

	$(".input #message").val('');

	if (nameForUserID(domain).locked) {
		inputEnabled(false, "verify");
	}
	else if ($("#conversations tr[data-id="+id+"]").hasClass("locked")) {
		inputEnabled(false, "locked");
	}
	else {
		inputEnabled(true);
	}

	updateConversationHeader(id);

	if (isGroup(id)) {
		$("#holder").attr("data-type", "group");
	}
	else {
		$("#holder").attr("data-type", "private");
	}

	if (id == conversation) {
		return;
	}

	conversation = id;
	localStorage.setItem("conversation", conversation);

	updateActiveConversation(id);
	messageTabForConversation(conversation);
	updateMessageTabs();

	if ($("#users .searching.shown").length) {
		updateSearchView();
	}

	$("#messages").empty();
	$("#chats .content .needSLD").remove();
	messages = [];
	unexpandedLinks = [];
	replying = false;
	updateReplying();
	close();

	if (!loadingConversations) {
		loadMessages(conversation);
	}

	updateUsers();
}

function getOtherUserID(id) {
	let conversation = conversations[id];

	let user = Object.keys(conversation.users).filter(user => {
		return user !== domain;
	}).join(", ");

	return user;
}

function getOtherUser(id) {
	let conversation = conversations[id];

	let user = Object.keys(conversation.users).filter(user => {
		return user !== domain;
	}).join(", ");

	return conversation.users[user];
}

function isGroup(id) {
	try {
		if (conversations[id].group) {
			return true;
		}
	}
	catch (error) {}
	return false;
}

function nameForUserID(id) {
	var userId = id;
	let user = users.filter(user => {
		return user.id == userId;
	});

	return user[0];
}

function typingCell() {
	return '<td class="typingCell flex"><div class="message typing"><div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div></div></td>';
}

function conversationRow(id, user, puny=false) {
	var subtitle = ""

	if (isGroup(id)) {
		let channel = toUnicode(user);
		let info = conversations[id];
		let latestMessage = info.latestMessage;
		if (latestMessage.message) {
			let name = toUnicode(nameForUserID(latestMessage.user).domain);

			let message = replaceIds(latestMessage.message, false);
			subtitle = name+'<span class="decrypt">'+message+'</span>';
		}

		var locked = "";
		var lockedCell = '';

		if (!Object.keys(info.users).includes(domain)) {
			locked = "locked";
			lockedCell = '<div class="locked"><div class="icon lock" title="Locked"></div></div>';
		}

		return '<tr data-id="'+id+'" class="'+locked+'"><td class="avatar">'+lockedCell+'<div class="fallback">#</div></td><td class="title">'+channel+'<div class="subtitle">'+subtitle+'</div></td>'+typingCell()+'</tr>';
	}
	else {
		var locked = "";
		var lockedCell = '';

		if (!user.claimed) {
			locked = "unclaimed";
			lockedCell = '<div class="unclaimed"><div class="icon warning" title="Unclaimed"></div></div>';
		}
		else if (user.locked) {
			locked = "locked";
			lockedCell = '<div class="locked"><div class="icon lock" title="Locked"></div></div>';
		}

		let latestMessage = conversations[id].latestMessage;
		if (latestMessage.message) {
			let name = toUnicode(conversations[id].users[latestMessage.user].domain);

			let message = latestMessage.message;
			subtitle = name+'<span class="decrypt">'+message+'</span>';
		}

		let userId = getOtherUserID(id);
		let userName = toUnicode(user.domain);
		let fallback = String.fromCodePoint(userName.codePointAt(0));

		var decoded = "";
		if (puny && user.domain !== userName) {
			decoded = '<div class="decoded">('+user.domain+')</div>';
		}

		return '<tr data-id="'+id+'" class="'+locked+'"><td class="avatar">'+lockedCell+'<div class="favicon" data-id="'+userId+'" data-domain="'+user.domain+'"></div><div class="fallback">'+fallback.toUpperCase()+'</div></td><td class="title">'+userName+'/'+decoded+'<div class="subtitle">'+subtitle+'</div></td>'+typingCell()+'</tr>';
	}
}

function userRow(user) {
	let userName = toUnicode(user.domain);
	let fallback = String.fromCodePoint(userName.codePointAt(0));

	return '<tr class="user" data-id="'+user.id+'" data-name="'+userName+'"><td class="avatar"><div class="favicon" data-id="'+user.id+'" data-domain="'+user.domain+'"></div><div class="fallback">'+fallback.toUpperCase()+'</div></td><td class="title">'+userName+'/</td></tr>';
}

function messageAvatar(id, domain) {
	let fallback = String.fromCodePoint(domain.codePointAt(0));
	
	return '<div class="avatar"><div class="favicon" data-id="'+id+'" data-domain="'+domain+'"></div><div class="fallback">'+fallback.toUpperCase()+'</div></div>';
}

function isAction(message) {
	if (message.substring(0, 8) === actionString) {
		return true;
	}
	return false;
}

function replaceSpecialMessages(message, prefix=true) {
	var subtitle;
	var pre = "";

	try {
		let json = JSON.parse(message);
		if (json.attachment) {
			subtitle = "sent an attachment.";
			pre = " ";
		}
		else if (json.payment) {
			subtitle = "sent a payment.";
			pre = " ";
		}
		else {
			subtitle = message;
			pre = ": ";
		}
	}
	catch (error) {
		if (isAction(message)) {
			subtitle = message.substring(7);
		}
		else {
			subtitle = message;
			pre = ": ";
		}
	}

	if (prefix) {
		subtitle = pre+subtitle;
	}

	return subtitle;
}

function updateSubtitle(el, text) {
	var decoded = decodeEntities(decodeEntities(text));
	decoded = replaceIds(decoded, false);
	subtitle = replaceSpecialMessages(decoded);
	el.text(subtitle);
	el.removeClass("decrypt");
}

function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decryptConversationSubtitle(id) {
	let el = $("#conversations tr[data-id="+id+"] .title .subtitle span.decrypt");

	if (el.length) {
		let dkey = conversations[id].key || null;
		let message = el.text();
		var subtitle = message;

		if (conversations[id].group) {
			updateSubtitle(el, message);
		}
		else {
			if (dkey) {
				decryptMessage(message, dkey, id).then(m => {
					updateSubtitle(el, m);
				});
			}
		}
	}
}

function unescape(str) {
  return (str + '==='.slice((str.length + 3) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
}

function escape(str) {
  return str.replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function shareLink() {
	let data = {
		session: key,
		privkey: keys.privateKeyJwk.d,
		settings: settings
	}

	let json = JSON.stringify(data);
	let encoded = btoa(json);
	let link = "https://"+host+"/sync#"+encoded;

	return link;
}

function setupShare() {
	$("#qrcode").empty();
	$("#qrcode").html('<div id="qrlogo"><img draggable="false" src="/assets/img/handshake"></div>');
	if (!$("#qrcode canvas").length) {
		let link = shareLink();
		var qrcode = new QRCode($("#qrcode")[0], {
			text: link,
			width: 200,
			height: 200,
			colorLight: css.getPropertyValue("--tertiaryBackground"),
			colorDark: css.getPropertyValue("--primaryForeground"),
			correctLevel: QRCode.CorrectLevel.L
		});
	}
	$("#qrcode img").attr("draggable", "false");
}

function setPublicKey() {
	let data = {
		action: "setPublicKey",
		pubkey: JSON.stringify(keys.publicKeyJwk)
	};

	return api(data);
}

function getPublicKey() {
	let data = {
		action: "getPublicKey"
	};

	return api(data);
}

function loadSettings() {
	if (localStorage.settings) {
		settings = JSON.parse(localStorage.settings);

		$.each(settings, (k, setting) => {
			root.style.setProperty("--"+k, setting);
		});
	}
}

function getInvite(code) {
	let data = {
		action: "getInvite",
		code: code
	};

	return api(data);
}

function onLoad() {
	var action;

	switch (page) {
		case "id":
			if (typeof invite !== "undefined" && invite.length) {
				getInvite(invite).then(r => {
					if (r.success && r.tld) {
						tld = r.tld;
						$("#addDomain input[name=domain]").remove();
						$("#addDomain .or").remove();
						$("#addDomain select[name=tld]").empty();
						$("#addDomain select[name=tld]").append('<option value="'+tld+'">'+toUnicode(tld)+'</option>');
						$("#addDomain input[name=sld]").attr("placeholder", "Choose a name");
						$(".button[data-action=newDomain]").click();
					}
					else {
						$("#addDomain").empty();
						$(".button[data-action=newDomain]").click();
						let response = $('<div class="error response" />');
						response.html("That invite code isn't valid.");
						$("#addDomain").append(response);
					}
				});
			}
			else {
				listTLD().then(r => {
					let options = r.tlds;
					$.each(options, (k, o) => {
						let option = $('<option value="'+o+'">'+toUnicode(o)+'</option>');
						$("#addDomain select[name=tld]").append(option);
					});

					getDomains().then(r => {
						$("#manageDomains .domains").empty();
						$("#manageDomains").show();

						var unlockedDomains = false;
						if (r.success) {
							domains = r.domains;

							if (!Object.keys(domains).length) {
								$("#manageDomains .button").click();
								return;
							}

							$.each(domains, (k, domain) => {
								var row = $('<div class="domain" />');
								row.attr("data-id", k);
								row.attr("data-name", domain.domain);

								var body = $('<div />');
								body.append(toUnicode(domain.domain)+'/');
								if (domain.locked) {
									body.append(' (Unverified)');
								}
								else {
									unlockedDomains = true;
								}
								row.html(body);

								let actions = $('<div class="actions" />');
								if (domain.locked) {
									actions.append('<div class="action link" data-action="reverifyDomain">Verify</div>');
								}
								actions.append('<div class="icon action delete" data-action="deleteDomain"></div>');

								row.append(actions);
								$("#manageDomains .domains").append(row);
							});
						}

						if (unlockedDomains) {
							$("#startChatting").removeClass("hidden");
						}
					});
				});
			}
			break;

		case "chat":
			getDomains().then(r => {
				if (r.success) {
					domains = r.domains;

					if (!Object.keys(domains).length) {
						goto("/id");
						return;
					}

					setupDomainSelect();
					
					if (Object.keys(domains).includes(localStorage.domain)) {
						domain = localStorage.domain;
						$('.header .domains option[value='+domain+']').prop('selected', true);
					}
					else {
						domain = Object.keys(domains)[0];
						localStorage.setItem("domain", domain);
					}

					getUsers().then(r => {
						if (r.success) {
							users = r.users;
							loadConversations();
							updateVerified();
						}
					});
				}
			});

			loadSettings();
			sizeInput();
			setupShare();
			setupNotifications();

			setTimeout(() => {
				websocket();
			}, 1000);

			setInterval(() => {
				ping();
			}, 1000);
			break;

		case "sync":
			try {
				let sync = window.location.hash.substr(1);
				let syncData = unescape(sync);
				let decoded = atob(syncData);
				let json = JSON.parse(decoded);
				key = json.session;

				if (json.settings) {
					settings = json.settings;
					localStorage.setItem("settings", JSON.stringify(settings));
				}

				getPublicKey().then(r => {
					if (r.success) {
						let pubkey = JSON.parse(r.pubkey);

						importKey(pubkey.x, pubkey.y, json.privkey).then(privkey => {
							keys = {
								privateKeyJwk: privkey,
								publicKeyJwk: pubkey
							}

							localStorage.setItem("session", key);
							localStorage.setItem("keys", JSON.stringify(keys));
							goto("/");
						});
					}
				});
			}
			catch (error) {
				$("body[data-page=sync] .response").html("This link is invalid :/");
			}
			break;
	}
}

function onLoadAction(data) {
	localStorage.removeItem("action");

	let split = data.split(":");

	let action = split[0];
	var info = split[1];

	switch (action) {
		case "message":
			info = toUnicode(info)+"/";
			$(".popover[data-name=startConversation] input[name=domain]").val(info);
			popover("startConversation");
			$(".popover[data-name=startConversation] input[name=message]").focus();
			break;

		case "channel":
			let match = Object.keys(conversations).filter(c => {
				return conversations[c].name == info;
			});

			if (match.length) {
				activeConversation(match[0]);
			}
			break;
	}

	window.location.replace("#");  
	if (typeof window.history.replaceState == 'function') {
		history.replaceState({}, '', window.location.href.slice(0, -1));
	}
}

function setupDomainSelect() {
	$(".header .domains select").empty();
	
	$.each(domains, (k, domain) => {
		var locked = "";
		if (domain.locked) {
			locked = " (Unverified)";
		}
		$(".header .domains select").append('<option value="'+k+'">'+toUnicode(domain.domain)+'/'+locked+'</option>');
	});

	$(".header .domains select").append('<optgroup label="-----------------"></optgroup>');
	$(".header .domains select").append('<option value="manageDomains">Manage Domains</option>');
}

async function popover(action) {
	close(true);

	let output = new Promise(resolve => {
		switch (action) {
			case "syncSession":
				resolve();
				break;

			case "pay":
				$(".popover[data-name="+action+"]").find(".response").html("");

				resolve();

				let to = getOtherUser(conversation).domain;
				let toID = getOtherUserID(conversation);

				let data = {
					action: "getAddress",
					domain: toID
				}

				api(data).then(r => {
					$(".popover[data-name="+action+"]").find(".loading").removeClass("shown");

					if (r.success) {
						$(".popover[data-name="+action+"]").find(".subtitle").html(to+"/ is able to accept payments!");
						$(".popover[data-name="+action+"]").find("input[name=address]").val(r.address);
						$(".popover[data-name="+action+"]").find(".content").addClass("shown");
						$(".popover[data-name="+action+"]").find("input[name=hns]").focus();
					}
					else {
						$(".popover[data-name="+action+"]").find(".response").addClass("error");
						$(".popover[data-name="+action+"]").find(".response").html(r.message);
					}
				});
				break;

			case "settings":
				let user = nameForUserID(domain);
				let tld = user.tld;

				if (tld) {
					$(".popover[data-name="+action+"]").find("input[name=avatar]").parent().removeClass("hidden");
					$(".popover[data-name="+action+"]").find("input[name=avatar]").val(user.avatar);

					if (["hnschat", "theshake"].includes(tld)) {
						$(".popover[data-name="+action+"]").find("input[name=address]").parent().removeClass("hidden");

						let data = {
							action: "getAddress",
							domain: domain
						}

						api(data).then(r => {
							if (r.address) {
								$(".popover[data-name="+action+"]").find("input[name=address]").val(r.address);
							}
							resolve();
						});
					}
					else {
						$(".popover[data-name="+action+"]").find("input[name=address]").parent().addClass("hidden");
						resolve();
					}
				}
				else {
					$(".popover[data-name="+action+"]").find("input[name=avatar]").parent().addClass("hidden");
					$(".popover[data-name="+action+"]").find("input[name=address]").parent().addClass("hidden");
					resolve();
				}
				break;

			case "mention":
			case "emojis":
				let bottom = $(".inputHolder").outerHeight() + 10;
				$(".popover[data-name="+action+"]").css("bottom", bottom+"px");
				resolve();
				break;

			default:
				resolve();
				break;
		}
	});

	output.then(() => {
		$("#blackout").addClass("shown");
		$("#messageHolder").addClass("noScroll");
		$(".popover[data-name="+action+"]").addClass("shown");

		if (!["syncSession"].includes(action)) {
			$(".popover[data-name="+action+"]").find("input:visible:first").focus();
		}

		if (action === "emojis") {
			$(".popover[data-name=emojis] .body .grid").scrollTop(0);
		}
	});
}

function copyToClipboard(button) {
	let field = button.parent().find("input")[0];
	field.select();
	field.setSelectionRange(0, 99999);
	navigator.clipboard.writeText(field.value);
	field.setSelectionRange(0, 0);

	button.addClass("copied");
	setTimeout(() => {
		button.removeClass("copied");
	}, 1000);
}

function close(old=false) {
	$("#blackout").removeClass("shown");
	$("#mention").removeClass("shown");
	$(".popover.shown").find("input").val('');
	$(".popover.shown").find(".response").html('');
	$(".popover.shown").find(".content").removeClass("shown");
	$(".popover.shown").find(".loading").addClass("shown");
	$(".popover.shown").removeClass("shown");
	$("#messageHolder").removeClass("noScroll");
	$(".popover[data-name=emojis] .grid .section").removeClass("hidden");
	$(".popover[data-name=emojis] .grid .section[data-name=Search]").addClass("hidden");

	if (!old) {
		$(".messageRow .hover.visible").removeClass("visible");
	}
}

function showChat(bool) {
	if (bool) {
		if (socketReady()) {
			$("body[data-page=chat] .connecting").addClass("hidden");
		}
	}
	else {
		$("body[data-page=chat] .connecting").removeClass("hidden");
	}
}

function socketReady() {
	if (socket && socket.readyState == 1) {
		return true;
	}
	return false;
}

function websocket() {
	if (socket) {
		if (socket.readyState !== 3) {
			return;
		}
	}

	socket = new WebSocket("wss://ws."+host);

	socket.onopen = (e) => {
		showChat(1);

		socket.send("IDENTIFY "+key);

		typing = setInterval(() => {
			sendTyping();
			updateTypingViews();
			updateTypingStatus();
		}, 250);
	};

	socket.onmessage = (e) => {
		parse(e.data);
	};

	socket.onclose = (e) => {
		showChat(0);

		socket = null;

		setTimeout(() => { 
			websocket();
		}, 1000);
	}
}

function unlockIfLocked(c, user) {
	conversations[c].users[user].locked = 0;
	conversations[c].users[user].claimed = 1;

	if (conversation == c) {
		updateConversationHeader(c);
		inputEnabled(true);
	}
}

function updateConversationHeader(id) {
	$(".messageHeader table").empty();

	if (isGroup(id)) {
		let name = conversations[id].name;
		$(".messageHeader table").append(conversationRow(id, name));
	}
	else {
		let name = getOtherUser(id);
		$(".messageHeader table").append(conversationRow(id, name, true));
	}
	updateAvatars();
}

function parse(message) {
	let split = message.match(/(?<command>[A-Z]+)\s(?<body>.+)/);
	let command = split.groups.command;
	let body = JSON.parse(split.groups.body);

	switch (command) {
		case "MESSAGE":
			if (Object.keys(conversations).includes(body.conversation)) {
				if (Object.keys(conversations[body.conversation].users).includes(domain)) {
					if (Object.keys(conversations[body.conversation].users).includes(body.user)) {
						if (Object.keys(typers).includes(body.user)) {
							delete typers[body.user];
							updateTypingViews();
						}

						if (!Object.keys(domains).includes(body.user)) {
							conversations[body.conversation].unreadMessages = 1;

							if (body.message.includes("@"+domain)) {
								conversations[body.conversation].unreadMentions = 1;
							}
						}

						unlockIfLocked(body.conversation, body.user);
					}

					loadingMessages += 1;
					prepareMessage(body, false);

					if (conversation == body.conversation && body.user !== domain) {
						markSeen(body.id);
					}

					let newLatest = {
						message: body.message,
						time: body.time,
						user: body.user
					};

					conversations[body.conversation].latestMessage = newLatest;

					if (isGroup(body.conversation)) {
						if (!Object.keys(conversations[body.conversation].users).includes(body.user)) {
							let user = users.filter(u => {
								return u.id == body.user;
							});

							if (user.length) {
								let firstUser = user[0];
								conversations[body.conversation].users[firstUser.id] = { domain: firstUser.domain };
								updateUsers();
							}
						}
					}

					updateConversation(body);
				}
			}
			break;

		case "REACTION":
			if (Object.keys(conversations).includes(body.conversation)) {
				if (Object.keys(conversations[body.conversation].users).includes(body.from)) {
					if (conversation == body.conversation) {
						let getMsg = messages.filter(message => {
							return message.id == body.message;
						});

						if (getMsg.length) {
							let msg = getMsg[0];
							if (!Object.keys(msg.reactions).includes(body.reaction)) {
								msg.reactions[body.reaction] = [];
							}

							if (msg.reactions[body.reaction].includes(body.from)) {
								let x = msg.reactions[body.reaction].indexOf(body.from);
								delete msg.reactions[body.reaction].splice(x, 1);

								if (!Object.keys(msg.reactions[body.reaction]).length) {
									delete msg.reactions[body.reaction];
								}
							}
							else {
								msg.reactions[body.reaction].push(body.from);
							}

							updateReactions(msg);
						}
					}
				}
			}
			break;

		case "DELETE":
			if (conversation == body.conversation) {
				let thisMessage = $(".messageRow[data-id="+body.message+"]");
				let nextMessage = thisMessage.next();
				thisMessage.remove();
				
				if (nextMessage.length) {
					stylizeMessage(nextMessage);
				}
				else {
					let lastMessage = $("#messages > .messageRow").last();
					stylizeMessage(lastMessage);
				}
			}

			if (body.latestMessage) {
				conversations[body.conversation].latestMessage = body.latestMessage;
				updateConversation({ conversation: body.conversation });
			}

			let lastRow = $("#messages > .messageRow").last();
			if (lastRow.hasClass("date")) {
				lastRow.remove();
			}
			break;

		case "CONVERSATION":
			createConversation(body).then(() => {
				if (started) {
					if (Object.keys(body.users).includes(started.from)) {
						let otherUser = getOtherUser(body.id);
						if (otherUser.domain = started.to) {
							$("#conversations").removeClass("showing");
							$("#users").removeClass("showing");
							activeConversation(body.id);
							sendMessage(body.id, started.message);
							started = null;
						}
					}
				}
			});
			break;

		case "TYPING":
			typers[body.from] = body;
			break;

		case "LOCKED":
			let locked = body;

			$.each(locked, (k, d) => {
				domains[d].locked = 1;
			});

			loadConversations();
			setupDomainSelect();
			break;

		case "USERS":
			users = body;
			break;
	}
}

function updateReactions(m) {
	let message = $("#messages .messageRow[data-id="+m.id+"]");
	if (message.length) {
		message.find(".reactions").empty();

		$.each(Object.keys(m.reactions), (k, r) => {
			let reaction = $('<div class="reaction" />');
			let emoji = $('<div />');
			let count = $('<div class="count" />');

			reaction.attr("data-reaction", r);
			emoji.html(r);
			count.html(m.reactions[r].length);

			let who = m.reactions[r];
			let reactors = [];
			$.each(who, (k, w) => {
				let name = toUnicode(nameForUserID(w).domain);
				reactors.push(name);
			});

			var reactorString = reactors[0];
			if (reactors.length > 1) {
				let beginning = reactors.slice(0, reactors.length - 1);
				let last = reactors.pop();
				reactorString = beginning.join(", ") + " and " + last;
			}

			reaction.attr("title", reactorString);

			if (m.reactions[r].includes(domain)) {
				reaction.addClass("self");
			}

			reaction.append(emoji);
			reaction.append(count);

			message.find(".reactions").append(reaction);
		});

		if (message.find(".reactions .reaction").length) {
			message.find(".holder.react").addClass("shown");
		}
		else {
			message.find(".holder.react").removeClass("shown");
		}
	}
}

function updateTypingViews() {
	var groupTypers = [];

	let typingRow = $('<div class="messageRow typing first last"><div class="message"><div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div></div></div>');
	if (Object.keys(typers).length) {
		$.each(typers, (k, typer) => {
			if (((Date.now() / 1000) - typer.time) <= 3) {
				if (typer.to == conversation) {
					try {
						let typerName = nameForUserID(typer.from).domain;
						groupTypers.push(toUnicode(typerName)+"/");
					}
					catch (error) {}
				}
				$("#conversations tr[data-id="+typer.to+"] .typingCell").addClass("shown");
			}
			else {
				$("#conversations tr[data-id="+typer.to+"] .typingCell").removeClass("shown");
				delete typers[typer.from];
			}
		});
	}

	let groupTyperCount = groupTypers.length;
	if (groupTyperCount) {
		var typingString = "";
		if (groupTyperCount > 1) {
			if (groupTyperCount > 5) {
				typingString = "Many users are typing...";
			}
			else {
				let beginning = groupTypers.slice(0, groupTypers.length - 1);
				let last = groupTypers.pop();
				typingString = beginning.join(", ") + " and " + last + " are typing...";
			}
		}
		else {
			typingString = groupTypers[0]+" is typing...";
		}
		$("#typing .message").html(typingString);
		$("#typing").addClass("shown");
	}
	else {
		$("#typing").removeClass("shown");
	}

	let typingRows = $("#conversations tr .typingCell.shown");
	$.each(typingRows, (k, row) => {
		let conversation = $(row).parent().data("id");

		if (!isGroup(conversation)) {
			let otherUser = getOtherUserID(conversation);

			if (!Object.keys(typers).includes(otherUser)) {
				$(row).removeClass("shown");
			}
		}
		else {
			if (Object.keys(typers).length) {
				let filtered = Object.keys(typers).filter(typer => {
					return typers[typer].to == conversation;
				});

				if (!filtered.length) {
					$(row).removeClass("shown");
				}
			}
			else {
				$(row).removeClass("shown");
			}
		}
	});
}

function updateTypingStatus() {
	if (lastTyped) {
		if ((Date.now() - lastTyped) > typingDelay) {
			imTyping = false;
		}
		else if ($(".input #message").is(":focus") && $(".input #message").val() !== "") {
			imTyping = true;
		}
	}
}

function sendTyping() {
	var input = $(".input #message").val();
	if (input && input[0] === "/") {
		return;
	}

	if (!imTyping) {
		return;
	}

	var shouldSend = false;
	if (typingSent) {
		var diff = Date.now() - typingSent;

		if (diff >= typingSendDelay) {
			shouldSend = true;
		}
	}
	else {
		shouldSend = true;
	}

	if (shouldSend) {
		/*
		if (!$(".channel[data-channel="+currentChannel+"]").length) {
			return;
		}
		*/
		typingSent = Date.now();
		
		let data = {
			action: "typing",
			from: domain,
			to: conversation
		};

		ws("ACTION", data);
	}
}

function toggleSignature() {
	if ($(".icon.signature").hasClass("on")) {
		$(".icon.signature").removeClass("on");
		$(".input #signature").removeClass("shown");
		$(".input #signature").val('');
		$(".input #message").focus();
	}
	else {
		$(".icon.signature").addClass("on");
		$(".input #signature").addClass("shown");
		$(".input #signature").focus();
	}
}

function showOrHideAttachments() {
	let attachments = $("#attachments");
	if (!attachments.find(".attachment").length) {
		attachments.removeClass("shown");
	}
	else {
		attachments.addClass("shown");
		fixScroll();
	}
}

async function setSession(data=false) {
	let setSession = new Promise(resolve => {
		if (localStorage.session) {
			key = localStorage.session;
			resolve(key);
		}
		else {
			startSession().then(r => {
				if (r.success) {
					key = r.session;
					localStorage.setItem("session", key);
					resolve(key);
				}
			});
		}
	});

	return await setSession;
}

async function setKeys() {
	let setKeys = new Promise(resolve => {
		if (localStorage.keys) {
			keys = JSON.parse(localStorage.keys);
			resolve(keys);
		}
		else {
			generateKeys().then(r => {
				keys = r;
				localStorage.setItem("keys", JSON.stringify(keys));
				setPublicKey().then(r => {
					resolve(keys);
				});
			});
		}
	});

	return await setKeys;
}

function verifySession() {
	let data = {
		action: "verifySession",
		pubkey: JSON.stringify(keys.publicKeyJwk)
	}

	return api(data);
}

function regexEscape(string) {
	return string.replace(/[.*+\'\`\-\_?^$\{\}\(\)\|\[\\\]\/\#\&\!\+\@\:\~\=]/g, '\\$&');
}

function tabComplete() {
	var prefix = "";
	var suffix = "";

	var text = $("#message").val();

	var options = [];
	if (text[0] === "/") {
		if (text.length > 1 && text[1] !== "/") {
			prefix = "/";
			suffix = " ";
			options = commands;

			text = text.substring(1);

		}
	}
	/*
	else if (text[0] === "@") {
		if (text.length > 1) {
			prefix = "@";
			suffix = "/ ";

			let conversationUsers = conversations[conversation].users;
			$.each(conversationUsers, (k, user) => {
				options.push(user.domain);
			});

			text = text.substring(1);
		}
	}
	*/

	options.sort();

	let matches = options.filter(option => {
		option = String(option);

		if (option.length) {
			return regexEscape(option.substr(0, text.length).toLowerCase()) == regexEscape(text.toLowerCase());
		}
		return;
	});

	if (matches.length) {
		$("#message").val(prefix+matches[0]+suffix);
	}
}

function getBrowser() {
	if (navigator.userAgent.indexOf("Chrome") != -1) {
		return "chrome";
	}
	else if (navigator.userAgent.indexOf("Firefox") != -1) {
		return "firefox";
	}
	else if (navigator.userAgent.indexOf("MSIE") != -1) {
		return "ie";
	}
	else if (navigator.userAgent.indexOf("Edge") != -1) {
		return "edge";
	}
	else if (navigator.userAgent.indexOf("Safari") != -1) {
		return "safari";
	}
	else if (navigator.userAgent.indexOf("Opera") != -1) {
		return "opera";
	}
	return "other";
}

function categoryForEmoji(emoji) {
	var cat = false;
	$.each(Object.keys(emojiCategories), (k, category) => {
		let data = emojiCategories[category];
		if (data.includes(emoji.category)) {
			cat = category;
			return false;
		}
	});

	if (cat) {
		return cat;
	}

	return false;
}

function openConversationWith(name) {
	if (nameForUserID(domain).locked) {
		return;
	}

	$(".popover[data-name=startConversation] input[name=domain]").val(name);
	popover("startConversation");
	
	setTimeout(() => {
		$(".popover[data-name=startConversation] input[name=message]").focus();
	}, 1);
}

function setupNotifications() {
	if ('Notification' in window && navigator.serviceWorker) {
		if (!(Notification.permission === "granted" || Notification.permission === "blocked")) {
			Notification.requestPermission(e => {
				if (e === "granted") {
					if ('serviceWorker' in navigator) {
						navigator.serviceWorker.register('/sw.js', {
							scope: '/',
						});
					}
				}
			});
		} 
	}
}

function sendNotification(title, body, conversation) {
	if ('Notification' in window && navigator.serviceWorker) {
		if (Notification.permission == 'granted') {
			navigator.serviceWorker.getRegistration().then(reg => {
				notificationSound.play();

				var options = {
					body: replaceSpecialMessages(body, false),
					icon: '/assets/img/logo.png',
					vibrate: [100, 50, 100],
					data: {
						dateOfArrival: Date.now(),
						primaryKey: 1
					},
					conversation: conversation
				};

				var notification = new Notification(title, options);
				notification.onclick = () => {
					activeConversation(conversation);
					window.focus();
				};
			});
		}
	}
}

function updateReplying() {
	if (replying) {
		let string = "Replying to "+toUnicode(nameForUserID(replying.sender).domain)+"/";
		$("#replying .message").html(string);
		$("#replying").addClass("shown");
	}
	else {
		$("#replying").removeClass("shown");
		$("#replying .message").html('');
	}
}

function updateVerified() {
	if (nameForUserID(domain).locked) {
		$("body").addClass("unverified");
	}
	else {
		$("body").removeClass("unverified");
	}
}

function getWordForPosition(text, position) {
	var index = text.indexOf(position);
	var preText = text.substr(0, position);

	if (preText.indexOf(" ") > 0) {
		var words = preText.split(" ");
		return (words.length - 1)
	}
	else {
		return 0;
	}
}

function setCaretPosition(ctrl, pos) {
	if (ctrl.setSelectionRange) {
		ctrl.focus();
		ctrl.setSelectionRange(pos, pos);
	} 
	else if (ctrl.createTextRange) {
		var range = ctrl.createTextRange();
		range.collapse(true);
		range.moveEnd('character', pos);
		range.moveStart('character', pos);
		range.select();
	}
}

function mentions(e) {
	var options = [];

	let field = $(e.currentTarget);
	let text = field.val();
	let words = text.split(" ");
	let position = field[0].selectionStart;

	let word = words[getWordForPosition(text, position)];
	if (word[0] === "@" && word.length > 1) {
		$("#mention .body .list").empty();

		options = Object.keys(conversations[conversation].users).filter(user => {
			let info = nameForUserID(user);
			let match = Array.from(toUnicode(info.domain)).slice(0, Array.from(word).length - 1).join("").toLowerCase();
			let search = word.toLowerCase();

			return !info.locked && "@"+match === search;
		}).slice(0, 10);

		$.each(options, (k, option) => {
			let row = userRow(nameForUserID(option));
			$("#mention .body .list").append(row);
		});

		$("#mention .user").first().addClass("active");

		updateAvatars();
	}

	if (options.length) {
		popover("mention");
	}
	else {
		close();
	}
}

async function sendWithBob(address, amount) {
	const wallet = await bob3.connect();

	if (!amount) {
		return { message: "Please enter an amount." };
	}

	try {
		const send = await wallet.send(address, amount);
		return send;
	}
	catch (error) {
		return error;
	}
}

async function signWithBob(id, domain, code) {
	const wallet = await bob3.connect();

	try {
		const signature = await wallet.signWithName(domain, code);
		return signature;
	}
	catch (error) {
		return error;
	}
}

async function signWithMetaMask(id, domain, code) {
	const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

	try {
		const account = accounts[0];
		const signature = await ethereum.request({ method: 'personal_sign', params: [ code, account ] });
		return {
			account: account,
			signature: signature
		}
	} 
	catch (error) {
		return error
	}
}

async function verifySignature(id, signature, account=null) {
	let data = {
		action: "verifySignature",
		domain: id,
		account: account,
		signature: signature
	};

	return api(data);
}

function setActive(active) {
	if (active) {
		isActive = true;
	}
	else {
		isActive = false;
	}
}

function ping() {
	let data = {
		action: "ping",
		from: domain
	};

	if (socketReady()) {
		ws("ACTION", data);
	}
}

function nameFromTarget(target) {
	var name;

	if (target.hasClass("favicon")) {
		name = target.data("domain")+"/";
	}
	else if (target.parent().hasClass("messageRow") || target.parent().parent().hasClass("messageRow") || target.parent().parent().parent().hasClass("messageRow")) {
		if (target.hasClass("user")) {
			name = target.text();
		}
	}
	else if (target.hasClass("inline nick")) {
		name = target.text().substring(1);
	}
	else {
		if (typeof target.data("name") !== "undefined") {
			name = target.data("name")+"/";
		}
	}

	if (name) {
		return name;
	}

	return false;
}

function userFromName(name) {
	let match = users.filter(n => {
		return name == toUnicode(n.domain);
	});

	if (match.length) {
		return match[0];
	}

	return false;
}

$(() => {
	urlAction = window.location.hash.substr(1);

	if (urlAction) {
		localStorage.setItem("action", urlAction);
	}
	else {
		if (localStorage.action) {
			urlAction = localStorage.action;
		}
	}

	page = $("body").data("page");

	if (page == "sync") {
		onLoad();
	}
	else {
		setSession().then(() => {
			setKeys().then(() => {
				verifySession().then(r => {
					if (!r.success) {
						if (key.substring(0, 3) !== "V2-") {
							delete key;
							delete keys;
							localStorage.clear();
							window.location.reload();
						}
						else {
							alert(r.message);
						}
					}
					else {
						onLoad();
					}
				});
			})
		});
	}

	if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
		$("body").addClass("desktop");
	}

	$(window).on("focus", e => {
		let target = $(e.currentTarget);

		if (target.attr("id") !== "message") {
			setActive(true);
		}

		let lastMessage = $("#messages > .messageRow[data-id]").last();
		let lastMessageID = lastMessage.data("id");
		if (lastMessageID) {
			let options = {
				after: lastMessageID
			}

			loadMessages(conversation, options);
		}
	});

	$(window).on("blur", () => {
		setActive(false);
	});

	$(document).on("mouseleave", () => {
	    setActive(false);
	});

	$(document).on("mouseenter", () => {
	    setActive(true);
	});

	$(document).on("keydown", e => {
		let code = e.keyCode || e.which;
		var target = $(e.currentTarget);

		if (!target.prop("tagName")) {
			target = $(e.target);
		}

		if (code == 27) {
			e.preventDefault();

			if ($("#replying.shown").length) {
				$(".action[data-action=removeReply]").click();
			}

			if ($("#blackout").is(":visible")) {
				close();
			}
			return;
		}

		if (["domain", "tld", "sld"].includes(target.attr("name"))) {
			if (!/[a-zA-Z0-9\-\.\/]/.test(e.key)) {
				e.preventDefault();
			}
		}

		if (["INPUT", "TEXTAREA"].includes(target.prop("tagName"))) {
			if (code == 13) {
				e.preventDefault();
				
				let button = target.closest(".body").find(".button");
				button.click();
				return;
			}

			if (!target.hasClass("tab")) {
				if (code == 9) {
					e.preventDefault();

					if (target.attr("id") === "message") {
						tabComplete();
					}
				}
				return;
			}
		}

		if (!$("#message").is(":focus")) {
			if (!$("#blackout").is(":visible")) {
				if ((e.key.length == 1 || code == 9) && !((e.ctrlKey || e.metaKey))) {
					if (code == 9) {
						e.preventDefault();
					}
					$("#message").focus();
				}
			}
		}
	})

	$("html").on("focus click", "#message", e => {
		mentions(e);
	});

	$("html").on("click", "#mention tr", e => {
		$("#mention tr").removeClass("active");
		$(e.currentTarget).addClass("active");
		
		let mention = "@"+$("#mention tr.active .title").html();
		let field = $(".input #message");
		let text = field.val();
		let words = text.split(" ");
		let position = field[0].selectionStart;
		let word = getWordForPosition(text, position);
		let before = words[word];
		words[word] = mention+" ";

		var newPosition = 0;
		for (var i = 0; i < words.length; i++) {
			newPosition += words[i].length;

			if (i == word) {
				newPosition += i;
				break;
			}
		}

		let replaced = words.join(" ");
		field.val(replaced);
		setCaretPosition(field[0], newPosition);
	});

	$("html").on("input paste keyup", "#users input[name=search]", e => {
		let code = e.keyCode || e.which;

		if (code == 27) {
			$("#users .action.close").click();
			return;
		}

		let search = $(e.currentTarget).val();
		searchUsers(search);
	});

	$("html").on("click", "#users .action[data-action=searchUsers]", () => {
		updateSearchView();
	});

	$("html").on("mousemove", "#mention tr", e => {
		$("#mention tr.active").removeClass("active");
		$(e.currentTarget).addClass("active");
	});

	$("html").on("input paste keyup", ".input #message", e => {
		let code = e.keyCode || e.which;

		switch (code) {
			case 27:
				return;
		}

		if (e.type === "keyup") {
			if ($("#mention").hasClass("shown")) {
				let selected = $("#mention tr.active");

				switch (code) {
					case 38:
					case 40:
						e.preventDefault();

						var select;
						selected.removeClass("active");

						if (code == 38) {
							if (selected[0].previousSibling) {
								select = selected[0].previousSibling
							}
							else {
								select = $("#mention .body .list").children().last();
							}
						}
						else {
							if (selected[0].nextSibling) {
								select = selected[0].nextSibling
							}
							else {
								select = $("#mention .body .list").children().first();
							}
						}

						$(select).addClass("active");
						return;

					case 27:
						e.preventDefault();
						$("#mention").removeClass("shown");
						return;
				}
			}
		}

		mentions(e);
		sizeInput();
	});

	$("html").on("keydown", ".input #message, .input #signature", e => {
		let code = e.keyCode || e.which;

		switch (code) {
			case 38:
			case 40:
			case 27:
				return;
		}

		if ($(e.currentTarget).val() && $(e.currentTarget).val()[0] !== "/" && e.key.length == 1) {
			lastTyped = Date.now();
		}

		if ($("#mention").hasClass("shown")) {
			switch (code) {
				case 9:
				case 13:
					e.preventDefault();
					$("#mention tr.active").click();
					return;
			}
		}
		else {
			if (code == 13) {
				e.preventDefault();

				let message = $(".input #message").val();
				let signature = $(".input #signature").val();

				let attachments = $("#attachments .attachment");
				if (attachments.find(".uploading").length) {
					return;
				}

				$.each(attachments, (k, attachment) => {
					let id = $(attachment).data("id");
					let data = {
						hnschat: 1,
						attachment: id
					};
					sendMessage(conversation, JSON.stringify(data));
				})

				if (message.length) {
					sendMessage(conversation, message, signature);
				}
				
				$(".input #message").val('');
				$(".input #signature").val('');
				$("#attachments").empty();
				showOrHideAttachments();
			}
		}
	});

	$("html").on("change", ".domains select", e => {
		let val = $(e.currentTarget).val();

		if (val === "manageDomains") {
			goto("/id");
			return;
		}

		showChat(false);

		domain = val;
		localStorage.setItem("domain", domain);
		loadConversations();

		$("#conversations").addClass("showing");
		updateVerified();
	});

	$("html").on("click", ".button,.link", e => {
		let target = $(e.currentTarget);

		let disabled = target.hasClass("disabled");
		if (disabled) {
			return;
		}

		var response = target.parent().find(".response");
		if (!response.length) {
			response = target.parent().parent().find(".response");
		}
		response.html("");
		response.removeClass("error");

		let element = target;
		let action = element.data("action");
		let text = element.html();

		if (element.hasClass("button")) {
			element.addClass("disabled");
			element.html("Loading...");
		}

		var value,usd,hns,price,address,message,tld,link;
		switch (action) {
			case "addDomain":
			case "verifyDomain":
				value = $(".form #"+action+" input[name=domain]").val();
				if (!value) {
					sld = $(".form #"+action+" input[name=sld]").val();
					tld = $(".form #"+action+" select[name=tld]").val();
					action = "addSLD";
				}
				break;

			case "startConversation":
				value = $(".popover[data-name=startConversation] input[name=domain]").val();
				message = $(".popover[data-name=startConversation] input[name=message]").val();
				break;

			case "reverifyDomain":
				value = target.closest(".domain").data("name");
				action = "addDomain";
				break;

			case "startChatting":
				if (typeof invite !== "undefined" && invite.length) {
					goto("/#channel:"+tld);
				}
				else {
					goto("/");
				}
				break;

			case "sendHNS":
				address = target.parent().find("input[name=address]").val();
				value = target.parent().find("input[name=hns]").maskMoney("unmasked")[0];
				break;

			case "submitDonation":
				price = $(".popover[data-name=donate] input[name=usd]").maskMoney("unmasked")[0];
				break;
		}

		switch (action) {
			case "newDomain":
			case "addDomain":
			case "addSLD":
			case "verifyDomain":
			case "reverifyDomain":
			case "sendHNS":
				response.removeClass("error");
				response.html("");
				break;
		}

		switch (action) {
			case "newDomain":
				$("#addDomain input[name=domain]").val('');
				$("#id .section").hide();
				$("#addDomain").show();
				$("#addDomain input[name=domain]").focus();
				element.html(text);
				element.removeClass("disabled");
				break;

			case "addDomain":
				addDomain(value).then(r => {
					if (r.success) {
						$("#id .section").hide();
						$("#verifyOptions input[name=domain]").val(value);
						$("#verifyDomain input[name=domain]").val(r.domain);
						$("#verifyDomain #code").html(r.code);

						if (r.eth) {
							$("#verifyOptions .button[data-action=verifyDomainWithTXT]").addClass("disabled");
							$("#verifyOptions .button[data-action=verifyDomainWithMetaMask]").removeClass("disabled");
						}
						else {
							$("#verifyOptions .button[data-action=verifyDomainWithTXT]").removeClass("disabled");
							$("#verifyOptions .button[data-action=verifyDomainWithMetaMask]").addClass("disabled");
						}

						if (value.includes(".")) {
							$("#verifyOptions .button[data-action=verifyDomainWithBob]").addClass("disabled");
						}
						else {
							$("#verifyOptions .button[data-action=verifyDomainWithBob]").removeClass("disabled");
						}

						$("#verifyOptions").show();
					}
					else {
						response.addClass("error");
						response.html(r.message);
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "addSLD":
				addSLD(sld,tld).then(r => {
					if (r.success) {
						localStorage.setItem("domain", r.domain);
						$("#id .section").hide();
						$(".section#startChatting").show();
					}
					else {
						response.addClass("error");
						response.html(r.message);
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "verifyDomainWithTXT":
				$("#verifyOptions").hide();
				$("#verifyDomain").show();

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "verifyDomainWithBob":
				var id = $("#verifyDomain input[name=domain]").val();
				var domainName = $("#verifyOptions input[name=domain]").val();
				var code = $("#verifyDomain #code").html();

				signWithBob(id, domainName, code).then(bob => {
					if (bob.message) {
						response.addClass("error");
						response.html("Error: "+bob.message);
					}
					else {
						verifySignature(id, bob).then(r => {
							if (r.success) {
								localStorage.setItem("domain", id);
								$("#id .section").hide();
								onLoad();
							}
							else {
								response.addClass("error");
								response.html(r.message);
							}
						});
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "verifyDomainWithMetaMask":
				var id = $("#verifyDomain input[name=domain]").val();
				var domainName = $("#verifyOptions input[name=domain]").val();
				var code = $("#verifyDomain #code").html();

				signWithMetaMask(id, domainName, code).then(metamask => {
					if (metamask.message) {
						response.addClass("error");
						response.html("Error: "+metamask.message);
					}
					else {
						verifySignature(id, metamask.signature, metamask.account).then(r => {
							if (r.success) {
								localStorage.setItem("domain", id);
								$("#id .section").hide();
								onLoad();
							}
							else {
								response.addClass("error");
								response.html(r.message);
							}

							if (element.hasClass("button")) {
								element.html(text);
								element.removeClass("disabled");
							}
						});
					}
				});
				break;

			case "verifyDomain":
				verifyDomain(value).then(r => {
					if (r.success) {
						localStorage.setItem("domain", value);
						$("#id .section").hide();
						onLoad();
					}
					else {
						response.addClass("error");
						response.html(r.message);
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "startConversation":
				let name = value.replace(/^[ ./]+/, '').replace(/[ ./]+$/, '');

				let user = userFromName(name);
				let to = user.domain;

				if (!to.length) {
					response.addClass("error");
					response.html("Please enter a name.");
				}
				else if (!message.length) {
					response.addClass("error");
					response.html("Please enter a message.");
				}
				else {
					checkName(domain, to).then(r => {
						if (r.success) {
							let data = {
								action: "startConversation",
								from: domain,
								to: to,
								message: message
							};

							started = data;

							ws("ACTION", data);

							close();
						}
						else {
							response.addClass("error");
							response.html(r.message);
						}
					});
				}

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "submitDonation":
				if (price) {
					let link = "https://btcpay.eskimosoftware.net/api/v1/invoices?storeId=559mPWkGX7vkXjjvC7kFhtUEhBosN7TaHrbtBhjQK7UU&currency=USD&price="+price;
					goto(link);
				}
				else {
					response.addClass("error");
					response.html("Please enter an amount.");
				}

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "sendHNS":
				sendWithBob(address, value).then(bob => {
					if (bob.message) {
						response.addClass("error");
						response.html("Error: "+bob.message);
					}
					else {
						if (bob.hash) {
							let data = {
								hnschat: 1,
								payment: bob.hash,
								amount: value
							};
							sendMessage(conversation, JSON.stringify(data));
							close();
						}
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "saveSettings":
				var fields = $(".popover[data-name=settings] input.color");
				$.each(fields, (k, field) => {
					let name = $(field).attr("name");
					let val = $(field).val();
					settings[name] = val;
				});

				localStorage.setItem("settings", JSON.stringify(settings));

				let data = {
					action: "saveSettings",
					domain: domain,
					settings: {}
				}

				fields = $(".popover[data-name=settings] input.remote");
				$.each(fields, (k, field) => {
					let name = $(field).attr("name");
					let val = $(field).val();
					data.settings[name] = val;
				});

				data.settings = JSON.stringify(data.settings);

				api(data).then(r => {
					if (r.success) {
						if (r.avatar) {
							delete avatars[domain];
							nameForUserID(domain).avatar = r.avatar;
							$(".favicon.loaded[data-id="+domain+"]").removeClass("loaded");
							updateAvatars();
						}

						setupShare();
						close();
					}
					else {
						response.addClass("error");
						response.html(r.message);
					}

					if (element.hasClass("button")) {
						element.html(text);
						element.removeClass("disabled");
					}
				});
				break;

			case "purchaseSLD":
				tld = toASCII(element.data("tld"));

				link = "https://porkbun.com/tld/"+tld;
				if (element.data("registrar") == "hshub") {
					link = "https://varo.domains/tld/"+tld;
				}
				else if (element.data("registrar") == "impervious") {
					link = "https://impervious.domains";
				}
				
				goto(link, true);

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "createSLD":
				tld = element.data("tld");
				link = "/invite/"+tld;
				goto(link);

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "verifyName":
				goto("/id");

				if (element.hasClass("button")) {
					element.html(text);
					element.removeClass("disabled");
				}
				break;

			case "switchName":
				let switchTo = element.data("id");
				$(".header .domains select").val(switchTo);
				$(".header .domains select").trigger("change");
				break;
		}
	});

	$("html").on("click", "#conversations tr", e => {
		$("#conversations").removeClass("showing");
		let id = $(e.currentTarget).data("id");

		if (id !== conversation) {
			activeConversation(id);
		}
	});

	$("html").on("click", ".action", e => {
		let context = false;

		let target = $(e.currentTarget);
		let disabled = target.hasClass("disabled");
		if (disabled) {
			return;
		}

		let action = target.data("action");
		var data;
		switch (action) {
			case "startConversation":
				if (!nameForUserID(domain).locked) {
					popover(action);
				}
				break;

			case "startConversationWith":
				let name = target.closest(".body").find("span.subtitle").html();
				openConversationWith(name);
				break;

			case "deleteDomain":
				let row = target.closest(".domain");
				let id = row.data("id");
				data = {
					action: "deleteDomain",
					domain: id
				}
				api(data).then(r => {
					if (r.success) {
						row.remove();
					}
				});
				break;

			case "signature":
				toggleSignature();
				break;

			case "donate":
				$(".popover[data-name=donate] input[name=usd]").maskMoney({prefix:'$ '});
				break;

			case "settings":
				$(".popover[data-name=settings] input[name=bubbleBackground]").val(css.getPropertyValue("--bubbleBackground").trim());
				$(".popover[data-name=settings] input[name=bubbleSelfBackground]").val(css.getPropertyValue("--bubbleSelfBackground").trim());
				$(".popover[data-name=settings] input[name=bubbleMentionBackground]").val(css.getPropertyValue("--bubbleMentionBackground").trim());
				break;

			case "syncSession":
				$(".popover[data-name=syncSession] input[name=session]").val(shareLink());
				break;

			case "pay":
				$(".popover[data-name=pay] input[name=hns]").maskMoney({suffix: ' HNS', precision: 6});
				break;

			case "file":
				$("#file")[0].click();
				break;

			case "removeAttachment":
				let attachment = target.parent().parent();
				attachment.remove();
				showOrHideAttachments();
				deleteAttachment(attachment.data("id"));
				break;

			case "close":
				close();
				break;

			case "reply":
				replying = {
					message: target.closest(".messageRow").data("id"),
					sender: target.closest(".messageRow").data("sender"),
				}

				if (!replying.message) {
					context = true;
					replying = {
						message: target.closest(".body").find("span.message").data("id"),
						sender: target.closest(".body").find("span.message").data("sender")
					}
				}

				updateReplying();
				$(".input #message").focus();
				break;

			case "removeReply":
				replying = false;
				updateReplying();
				$(".input #message").focus();
				break;

			case "emojis":
				var sender;

				if (target.closest(".input").length) {
					sender = "input";
				}
				else {
					sender = "message";
				}

				setupEmojiView(e, sender);
				break;

			case "deleteMessage":
				let msgId = target.closest(".messageRow").data("id");

				if (!msgId) {
					context = true;
					msgId = target.closest(".body").find("span.message").data("id");
				}

				data = {
					action: "deleteMessage",
					message: msgId,
					domain: domain
				}
				ws("ACTION", data);
				break;

			case "clipboard":
				copyToClipboard(target);
				break;
		}

		switch (action) {
			case "donate":
			case "settings":
			case "syncSession":
			case "pay":
			case "emojis":
				popover(action);
				break;
		}

		if (context) {
			close();
		}
	});

	$(window).on("contextmenu", e => {
		let target = $(e.target);

		if (["INPUT", "TEXTAREA"].includes(target.prop("tagName")) || target.hasClass("body") || (target.hasClass("inline") && !target.hasClass("nick"))) {
			return;
		}
		else {
			e.preventDefault();

			if (target.hasClass("user") || target.hasClass("favicon") || target.hasClass("inline nick")) {
				var name = nameFromTarget(target);
				if (name) {
					name = rtrim(name, "/");
					name = toASCII(name);
					name = toUnicode(name)+"/";
					let menu = $(".popover[data-name=userContext]");
					menu.find("span.user").html(name);
					popover("userContext");
					setContextMenuPosition(menu, e);
				}
			}
			else if (target.closest(".messageRow").length) {
				let body = target.closest(".messageRow").find(".message .body");
				let message = body.text();

				if (body.find("img").length) {
					message = "Attachment";
				}

				let menu = $(".popover[data-name=messageContext]");
				menu.find("span.message").html(message);
				menu.find("span.message").data("id", target.closest(".messageRow").data("id"));
				menu.find("span.message").data("sender", target.closest(".messageRow").data("sender"));

				menu.find("li.action.delete").addClass("hidden");
				if (isGroup(conversation)) {
					let me = nameForUserID(domain);
					let myName = me.domain;
					let conv = conversations[conversation];
					let channelName = conv.name;
					let channelAdmins = conv.admins;
					let channelTLDAdmin = conv.tldadmin;
					
					if ((channelTLDAdmin && myName === channelName) || me.admin || conv.admins.includes(domain)) {
						menu.find("li.action.delete").removeClass("hidden");
					}
				}

				popover("messageContext");
				setContextMenuPosition(menu, e);
			}
		}
	});

	$("html").on("keyup", ".popover[data-name=emojis] input", e => {
		let query = $(e.currentTarget).val().replace(/[^a-zA-Z0-9]/gi, '').toLowerCase();

		if (query) {
			let emo = $(".popover[data-name=emojis] .section:not([data-name=Search]) .emoji");
			let matches = emo.filter((k, em) => {
				var aliases = $(em).data("aliases");

				$.each(aliases, (k, alias) => {
					aliases[k] = alias.replace(/[^a-zA-Z0-9]/gi, '').toLowerCase();
				});

				return aliases.join("|").includes(query);
			});

			$(".popover[data-name=emojis] .grid .section[data-name=Search] .emojis").empty();
			$.each(matches, (k, match) => {
				let clone = match.cloneNode(true);
				$(".popover[data-name=emojis] .grid .section[data-name=Search] .emojis").append(clone);
			});

			$(".popover[data-name=emojis] .grid .section").addClass("hidden");
			$(".popover[data-name=emojis] .grid .section[data-name=Search]").removeClass("hidden");
		}
		else {
			$(".popover[data-name=emojis] .grid .section").removeClass("hidden");
			$(".popover[data-name=emojis] .grid .section[data-name=Search]").addClass("hidden");
		}
	});

	$("html").on("click", ".popover[data-name=emojis] .emoji", e => {
		let sender = $(".popover[data-name=emojis]").data("sender");
		let emoji = $(e.currentTarget);
		let em = emoji.html();
		
		switch (sender) {
			case "input":
				let field = $(".input #message");
				let current = field.val();
				let split = Array.from(current);
				let position = field[0].selectionStart;
				let added = replaceRange(current, position, position, em);
				field.val(added);
				close();
				$(".input #message").focus();
				setCaretPosition(field[0], position + em.length);
				break;

			case "message":
				let reacting = $(".messageRow .hover.visible").closest(".messageRow").data("id");
				close();
				let data = {
					action: "react",
					conversation: conversation,
					from: domain,
					message: reacting,
					reaction: em
				};
				ws("ACTION", data);
				break;
		}
	});

	$("html").on("click", ".reaction", e => {
		let target = $(e.currentTarget);
		let reacting = target.closest(".messageRow").data("id");
		let em = target.data("reaction");

		let data = {
			action: "react",
			conversation: conversation,
			from: domain,
			message: reacting,
			reaction: em
		};
		ws("ACTION", data);
	});

	$("html").on("keyup", ".popover[data-name=settings] input.color", e => {
		let target = $(e.currentTarget);
		let name = "--"+target.attr("name");
		let value = target.val();
		root.style.setProperty(name, value);
	});

	$("html").on("change", "#file", e => {
		let file = $(e.currentTarget)[0].files[0];

		if (file) {
			var url = URL.createObjectURL(file);
			let attachments = $("#attachments");
			let attachment = $('<div class="attachment" />'); 
        	attachment.css("background-image", "url("+url+")");

        	let loading = $('<div class="uploading lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>');
        	attachment.append(loading);

        	let removeHolder = $('<div class="removeHolder" />');
        	let remove = $('<div class="icon action remove" data-action="removeAttachment" />');
        	removeHolder.append(remove);
        	attachment.append(removeHolder);

			$("#attachments").append(attachment);
			showOrHideAttachments();

			var data = new FormData;
		    data.append("file", file);
		    data.append("key", key);
			upload(data, attachment).then(r => {
				attachment.find(".uploading").remove();

				if (r.success) {
					attachment.attr("data-id", r.id);
				}
				else {
					alert(r.message);
					attachment.remove();
				}

				showOrHideAttachments();
				$("#message").focus();
			});
		}
	});

	$("html").on("click", "#conversations .tabs .tab", (e) => {
		let tab = $(e.currentTarget).data("tab");
		switchMessageTab(tab);
	});

	$("html").on("click", "#blackout", () => {
		close();
	});

	$("html").on("click", ".message.signed", e => {
		if ($(e.currentTarget).hasClass("signature")) {
			return;
		}

		let signature = $(e.currentTarget).find(".signature");

		if (signature.hasClass("shown")) {
			signature.removeClass("shown");
		}
		else {
			signature.addClass("shown");
		}
	});

	$("html").on("dblclick", "#users .user, .messageRow .user, .messageRow .favicon, .inline.nick", e => {
		let target = $(e.currentTarget);
		var name = nameFromTarget(target);

		if (name) {
			openConversationWith(name)
		}
	});

	$("html").on("keyup", "input", e => {
		e.preventDefault();

		if (e.which == 13) {
			$(e.currentTarget).closest(".section").find(".button").click();
		}
	});

	$("html").on("click", ".header .left", () => {
		$("#users").removeClass("showing");
		$("#conversations").toggleClass("showing");
	});

	$("html").on("click", ".header .right", () => {
		$("#conversations").removeClass("showing");
		$("#users").toggleClass("showing");
	});

	$("#messageHolder").on("scroll", e => {
		let messageHolder = $("#messageHolder");
		if (loadingMessages) {
			return;
		}

		let height = messageHolder.outerHeight();
		let scrollTop = messageHolder[0].scrollTop;
		let scrollHeight = messageHolder[0].scrollHeight - messageHolder.height();

		if ((scrollHeight - height) == 0) {
			return;
		}

		let calc = Math.floor(scrollHeight + scrollTop);
		if (calc < 1) {
			loadingMessages = 1;
			let firstMessage = $("#messages > .messageRow[data-id]").first();
			let firstMessageID = firstMessage.data("id");
			if (firstMessageID) {
				let options = {
					before: firstMessageID
				}
				loadMessages(conversation, options);
			}
		}
	});

	$(window).on("resize", () => {
		sizeInput();
	});

	log("Created by eskimo - https://skmo");
});