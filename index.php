<?php
	include "etc/includes.php";
?>
<!DOCTYPE html>
<html>
<head>
	<?php include "etc/head.php"; ?>
</head>
<body data-page="chat">
	<div class="connecting">
		<div class="lds-facebook"><div></div><div></div><div></div></div>
	</div>
	<div id="blackout"></div>
	<div class="popover" data-name="startConversation">
		<div class="head">
			<div class="title">New Conversation</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<input class="tab" type="text" name="domain" placeholder="hnschat/">
			<input type="text" name="message" placeholder="Message">
			<div class="button" data-action="startConversation">Start Conversation</div>
			<div class="response"></div>
		</div>
	</div>
	<div class="popover" data-name="syncSession">
		<div class="head">
			<div class="title">Sync Session</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="subtitle">Use this QR code or link to sync your session to another browser.</div>
			<div id="qrcode"></div>
			<div class="group">
				<input readonly="readonly" class="copyable" type="text" name="session">
				<div class="icon action clipboard" data-action="clipboard"></div>
			</div>
		</div>
	</div>
	<div class="popover" data-name="donate">
		<div class="head">
			<div class="title">Donate</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="subtitle">If you enjoy using this free service, please consider donating.</div>
			<input type="text" name="usd" placeholder="$ 1.00">
			<div class="button" data-action="submitDonation">BTC, LTC, or DOGE with BTCPay</div>
			<div class="response"></div>
			<div class="address">hs1qf0cxy6ukhgjlmqfhe0tpw800t2tcul4s0szwqa</div>
			<div class="center">&copy; <?php echo date("Y"); ?>&nbsp;<a href="https://eskimosoftware" target="_blank">Eskimo Software</a></div>
		</div>
	</div>
	<div class="popover" data-name="pay">
		<div class="head">
			<div class="title">Send HNS</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="loading flex shown">
				<div class="lds-facebook"><div></div><div></div><div></div></div>
			</div>
			<div class="content">
				<div class="subtitle"></div>
				<input type="hidden" name="address">
				<input type="text" name="hns" placeholder="0.00 HNS">
				<div class="button" data-action="sendHNS">Send with Bob Extension</div>
			</div>
			<div class="response"></div>
		</div>
	</div>
	<div class="popover" data-name="settings">
		<div class="head">
			<div class="title">Settings</div>
			<div class="icon action close" data-action="close"></div>
		</div>
		<div class="body">
			<div class="setting">
				<div class="subtitle">Avatar URL</div>
				<input class="remote tab" type="text" name="avatar" placeholder="">
			</div>
			<div class="setting">
				<div class="subtitle">HNS Wallet Address</div>
				<input class="remote tab" type="text" name="address" placeholder="">
			</div>
			<div class="setting">
				<div class="subtitle">Chat Bubble Color</div>
				<input class="color tab" type="text" name="bubbleBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Self Chat Bubble Color</div>
				<input class="color tab" type="text" name="bubbleSelfBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Mention Chat Bubble Color</div>
				<input class="color" type="text" name="bubbleMentionBackground">
			</div>
			<div class="setting">
				<div class="subtitle">Sync Session</div>
				<div class="center action link" data-action="syncSession">Show QR + Link</div>
			</div>
			<div class="button" data-action="saveSettings">Save</div>
			<div class="response"></div>
		</div>
	</div>
	<div class="popover contextMenu" data-name="userContext">
		<div class="body">
			<ul>
				<li>
					<span class="user subtitle"></span>
				</li>
			</ul>
			<div class="separator"></div>
			<ul>
				<li class="action" data-action="startConversationWith">Message</li>
			</ul>
		</div>
	</div>
	<div class="popover contextMenu" data-name="messageContext">
		<div class="body">
			<ul>
				<li>
					<span class="message subtitle">Blah blah blah</span>
				</li>
			</ul>
			<div class="separator"></div>
			<ul>
				<li class="action reply" data-action="reply">Reply</li>
				<li class="action emoji" data-action="emojis">React</li>
				<li class="action delete error" data-action="deleteMessage">Delete</li>
			</ul>
		</div>
	</div>
	<div id="holder">
		<div class="header">
			<div class="left">
				<div class="icon menu"></div>
			</div>
			<div class="center">
				<div class="logo">
					<img draggable="false" src="/assets/img/handshake">
					<span>Chat</span>
				</div>
				<div class="domains">
					<select></select>
				</div>
			</div>
			<div class="right">
				<div class="icon users"></div>
			</div>
		</div>
		<div id="chats">
			<div id="conversations" class="sidebar">
				<div class="title">
					<div class="tabs">
						<div class="tab" data-tab="channels">Channels</div>
						<div class="tab" data-tab="private">Private</div>
					</div>
					<div class="action icon compose" data-action="startConversation"></div>
				</div>
				<div class="sections">
					<div class="section channels">
						<table></table>
					</div>
					<div class="section private">
						<table></table>
					</div>
				</div>
				<div class="footer">
					<div class="action link" data-action="settings">Settings</div>
					<a href="https://wolf-5.gitbook.io/hnschat/" target="_blank">Help</a>
					<div class="action link" data-action="donate">Donate</div>
				</div>
			</div>
			<div class="content">
				<div class="messageHeader">
					<table></table>
				</div>
				<div id="messageHolder">
					<div class="popover" id="mention" data-name="mention">
						<div class="head">
							<div class="title">Mention</div>
							<div class="icon action close" data-action="close"></div>
						</div>
						<div class="body">
							<table class="list"></table>
						</div>
					</div>
					<div class="popover" id="emojis" data-name="emojis">
						<div class="head">
							<div class="title">Emojis</div>
							<div class="icon action close" data-action="close"></div>
						</div>
						<div class="body">
							<div class="search">
								<input type="text" name="searchEmojis" placeholder="Search">
							</div>
							<div class="grid"></div>
						</div>
					</div>
					<div id="messages"></div>
				</div>
				<div class="inputContainer">
					<div id="typing" class="flex">
						<div class="message">Test</div>
					</div>
					<div id="replying" class="flex">
						<div class="message"></div>
						<div class="action icon remove" data-action="removeReply"></div>
					</div>
					<div id="attachments" class="flex"></div>
					<div class="inputHolder">
						<div class="input">
							<div class="action icon plus" data-action="file">
								<input id="file" type="file" name="file">
							</div>
							<div class="action icon pay" data-action="pay"></div>
							<div class="action icon emoji big" data-action="emojis"></div>
							<div class="inputs">
								<textarea id="message" placeholder="Message"></textarea>
							</div>
						</div>
						<div class="verify">Verify your name to chat.</div>
						<div class="locked">This conversation is locked.</div>
						<div class="noConversations">You have no conversations.</div>
					</div>
				</div>
			</div>
			<div id="users" class="sidebar">
				<div class="title">
					<div class="group normal">
						<div class="action icon search" data-action="searchUsers"></div>
						<div>Users</div>
					</div>
					<div class="group flex searching">
						<input type="text" name="search">
						<div class="action icon close" data-action="searchUsers"></div>
					</div>
					<div id="count"></div>
				</div>
				<div class="sections">
					<div class="section users">
						<table></table>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div id="avatars"></div>
</body>
</html>