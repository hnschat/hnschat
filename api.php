<?php
	header('Access-Control-Allow-Origin: *'); 
	
	include "etc/includes.php";

	$json = file_get_contents('php://input');
	$data = json_decode($json, true);

	if (!$data) {
		$data = $_GET;
	}

	if (!@$data["action"]) {
		die();
	}

	foreach ($data as $key => $value) {
		$data[$key] = trim($value, ". /");
	}

	$output["success"] = true;

	/* VALIDATE KEY */
	switch ($data["action"]) {
		case "startSession":
		case "checkName":
			break;

		default:
			if ($data["key"]) {
				$keyValid = @sql("SELECT * FROM `sessions` WHERE `id` = ?", [$data["key"]]);
				if (!$keyValid) {
					error("Invalid key");
				}
			}
			else {
				error("Missing key");
			}
			break;
	}
	
	/* VERIFY PERMISSIONS */
	switch ($data["action"]) {
		case "getConversations":
		case "deleteMessage":
			$verifyOwnership = isDomainInSession($data["domain"], $data["key"]);
			if (!$verifyOwnership) {
				error("This domain isn't part of your session.");
			}
			break;

		case "getMessages":
			switch (strlen($data["conversation"])) {
				case 8:
					$channelInfo = channelForID($data["conversation"]);
					if (!$channelInfo) {
						error("This channel doesn't exist?");
					}

					$verifyOwnership = isDomainInSession($data["domain"], $data["key"]);
					if (!$verifyOwnership) {
						error("This domain isn't part of your session.");
					}

					$domainInfo = domainForID($data["domain"]);
					$tld = tldForDomain($domainInfo["domain"]);
					if (!$channelInfo["public"] && $tld !== $channelInfo["name"]) {
						$GLOBALS["needSLD"] = true;
						error("You don't have access to this channel.");
					}
					else if ($domainInfo["locked"]) {
						$GLOBALS["unverified"] = true;
						error("You don't have access to this channel.");
					}
					break;

				case 16:
					$domains = domainIDSForSession($data["key"]);
					$getConversation = sql("SELECT `users` FROM `conversations` WHERE `id` = ?", [$data["conversation"]])[0];
					if ($getConversation) {
						$users = json_decode($getConversation["users"]);
						$hasPermissions = array_intersect($domains, $users);
						if (!$hasPermissions) {
							error("This conversation isn't part of your session.");
						}
					}
					break;
				
				default:
					break;
			}
			break;

		case "deleteAttachment":
			$getAttachment = sql("SELECT * FROM `uploads` WHERE `id` = ? AND `session` = ?", [$data["id"], $data["key"]]);
			if (!$getAttachment) {
				error("This attachment isn't part of your session.");
			}
			break;

		default:
			break;
	}

	/* DO THE STUFF */
	switch ($data["action"]) {
		case "startSession":
			$code = "V2-".generateCode("session");
			sql("INSERT INTO `sessions` (id) VALUES (?)", [$code]);
			$output["session"] = $code;
			break;

		case "listTLD":
			$output["tlds"] = $specialDomains;
			break;

		case "checkTLD":
			$userDomains = domainsForSession($data["key"]);
			$tldMatches = [];
			foreach ($userDomains as $key => $nameInfo) {
				if (tldForDomain($nameInfo["domain"]) === $data["tld"]) {
					array_push($tldMatches, $nameInfo["id"]);
				}
			}
			$output["owned"] = $tldMatches;

			if (in_array($data["tld"], $specialDomains)) {
				$output["free"] = true;
			}
			else {
				if (in_array($data["tld"], $allSpecialDomains)) {
					$output["unavailable"] = true;
				}
				else {
					$canPurchase = isNameStaked($data["tld"]);
					if ($canPurchase) {
						$output["purchase"] = true;
					}
					else {
						$output["unavailable"] = true;
					}
				}
			}
			break;

		case "checkChannel":
			$channelInfo = channelForName($data["channel"]);

			if ($channelInfo) {
				$output["channel"] = $channelInfo["id"];
			}
 			break;

		case "getInvite":
			if (in_array($data["code"], $specialDomains)) {
				$output["tld"] = $data["code"];
			}
			else {
				$getTLD = @sql("SELECT `tld` FROM `invites` WHERE `code` = ?", [$data["code"]])[0];

				if ($getTLD) {
					$output["tld"] = $getTLD["tld"];
				}
			}
			break;

		case "getDomains":
			$domains = [];
			$getDomains = domainsForSession($data["key"]);
			if ($getDomains) {
				foreach ($getDomains as $key => $info) {
					$domains[$info["id"]] = [
						"domain" => $info["domain"],
						"locked" => $info["locked"],
					];
				}
			}
			$output["domains"] = $domains;
			break;

		case "addDomain":
			$data["domain"] = strtolower($data["domain"]);

			if (strlen($data["domain"]) < 1) {
				error("Well that can't be right.");
			}

			$tld = tldForDomain($data["domain"]);
			if ($tld !== $data["domain"] && in_array($tld, $specialDomains)) {
				error("Create a free SLD in the other field for this TLD.");
			}

			$verifyHandshake = domainIsHandshake($data["domain"]);
			if (!$verifyHandshake) {
				$verifyEthereum = domainIsEthereum($data["domain"]);
				if (!$verifyEthereum) {
					error("This name isn't a valid Handshake name.");
				}
			}
			
			$getCode = @sql("SELECT `id`,`code` FROM `domains` WHERE `domain` = ? AND `session` = ? AND `deleted` = 0", [$data["domain"], $data["key"]])[0];
			$getCodeAlt = @sql("SELECT `id`,`code` FROM `domains` WHERE `domain` = ? AND `session` IS NULL AND `deleted` = 0", [$data["domain"]])[0];
			if ($getCode) {
				$output["domain"] = $getCode["id"];
				$output["code"] = "hns-chat=".$getCode["code"];
			}
			else if ($getCodeAlt) {
				$output["domain"] = $getCodeAlt["id"];
				$output["code"] = "hns-chat=".$getCodeAlt["code"];
			}
			else {
				$domain = generateCode("domain");
				$code = generateCode("code");
				$addDomain = sql("INSERT INTO `domains` (id,domain,session,code,locked,created) VALUES (?,?,?,?,?,?)", [$domain, $data["domain"], $data["key"], $code, 1, time()]);
				if ($addDomain) {
					$output["domain"] = $domain;
					$output["code"] = "hns-chat=".$code;
				}
				else {
					error("An error occurred while tying this domain to your session. Try again?");
				}
			}
			break;

		case "addSLD":
			$data["sld"] = strtolower($data["sld"]);
			$data["tld"] = strtolower($data["tld"]);
			$fullName = $data["sld"].".".$data["tld"];

			if (strlen($data["sld"]) < 1 || strlen($data["tld"]) < 1) {
				error("Well that can't be right.");
			}

			$validate = preg_match("/^(?:[A-Za-z0-9][A-Za-z0-9\-]{0,61}[A-Za-z0-9]|[A-Za-z0-9])$/", $data["sld"], $match);
			if (!$match) {
				error("A name can only contain letters, numbers, and hyphens, but can't start or end with a hyphen.");
			}

			if (!in_array($data["tld"], $specialDomains)) {
				$validInvite = false;

				if (@$data["invite"]) {
					$checkInvite = @sql("SELECT * FROM `invites` WHERE `code` = ?", [$data["invite"]])[0];

					if ($checkInvite) {
						if ($checkInvite["tld"] === $data["tld"]) {
							$validInvite = true;
						}
					}
				}

				if (!$validInvite) {
					error("The selected TLD isn't available.");
				}
			}

			if (in_array($data["sld"], $bannedNames)) {
				error("The name you entered isn't available.");
			}

			$checkIfExists = sql("SELECT * FROM `domains` WHERE `domain` = ?", [$fullName]);
			if ($checkIfExists) {
				error("The name you entered isn't available.");
			}

			$domain = generateCode("domain");
			$addDomain = sql("INSERT INTO `domains` (id,domain,session,locked,created) VALUES (?,?,?,?,?)", [$domain, $fullName, $data["key"], 0, time()]);
			if ($addDomain) {
				$output["domain"] = $domain;
			}
			else {
				error("An error occurred while tying this domain to your session. Try again?");
			}
			break;

		case "deleteDomain":
			$deleteDomain = sql("UPDATE `domains` SET `deleted` = 1, `locked` = 1 WHERE `id` = ? AND `session` = ?", [$data["domain"], $data["key"]]);
			if (!$deleteDomain) {
				error("An error occurred while deleting this domain. Try again?");
			}
			break;

		case "verifyDomain":
			$getCode = @sql("SELECT * FROM `domains` WHERE `id` = ? AND `deleted` = 0", [$data["domain"]])[0];
			if ($getCode) {
				$verifyCode = $getCode["code"];

				if (@$getCode["session"]) {
					if ($getCode["session"] == $data["key"]) {
						$domains = unlockedDomainIDSForSession($data["key"]);
						if (in_array($data["domain"], $domains)) {
							break;
						}
						else {
							$verified = verifyCode($data["domain"], $verifyCode);
							if (@$verified["success"]) {
								$unlockThisOne = sql("UPDATE `domains` SET `locked` = 0 WHERE `id` = ?", [$data["domain"]]);
								$lockTheOthers = sql("UPDATE `domains` SET `locked` = 1 WHERE `domain` = ? AND `id` != ?", [$getCode["domain"], $data["domain"]]);
							}
							else {
								$errorMessage = "The TXT record was not found.";
								
								if (@$verified["error"]["ttl"]) {
									$errorMessage = "An invalid code was found in your DNS and is now cached for the duration set as your TTL. Please make sure the code is correct try again in ".secondsToHuman($verified["error"]["ttl"], true).".";
								}
								error($errorMessage);
							}
						}
					}
					else {
						error("This domain isn't part of your session.");
					}
				}
				else {
					$verified = verifyCode($data["domain"], $verifyCode);
					if (@$verified["success"]) {
						$unlockThisOne = sql("UPDATE `domains` SET `locked` = 0, `session` = ? WHERE `id` = ?", [$data["key"], $data["domain"]]);
					}
					else {
						$errorMessage = "The TXT record was not found.";
						
						if (@$verified["error"]["ttl"]) {
							$errorMessage = "An invalid code was found in your DNS and is now cached for the duration set as your TTL. Please make sure the code is correct try again in ".secondsToHuman($verified["error"]["ttl"], true).".";
						}
						error($errorMessage);
					}
				}
			}
			else {
				error("We have no record of that domain.");
			}
			break;

		case "verifySignature":
			$domainInfo = domainForID($data["domain"]);
			$verifyEthereum = domainIsEthereum($domainInfo["domain"]);
			if ($verifyEthereum) {
				if (verifySignature($domainInfo["domain"], $data["signature"], "hns-chat=".$domainInfo["code"], $data["account"])) {
					$unlockThisOne = sql("UPDATE `domains` SET `locked` = 0, `signature` = ?, `eth` = ? WHERE `id` = ?", [$data["signature"], $data["account"], $data["domain"]]);
					$lockTheOthers = sql("UPDATE `domains` SET `locked` = 1 WHERE `domain` = ? AND `id` != ?", [$domainInfo["domain"], $data["domain"]]);
				}
				else {
					error("That didn't work :/");
				}
			}
			else {
				if (verifySignature($domainInfo["domain"], $data["signature"], "hns-chat=".$domainInfo["code"])) {
					$unlockThisOne = sql("UPDATE `domains` SET `locked` = 0, `signature` = ? WHERE `id` = ?", [$data["signature"], $data["domain"]]);
					$lockTheOthers = sql("UPDATE `domains` SET `locked` = 1 WHERE `domain` = ? AND `id` != ?", [$domainInfo["domain"], $data["domain"]]);
				}
				else {
					error("That didn't work :/");
				}
			}
			break;

		case "getUsers":
			$output["users"] = getUsers($allSpecialDomains);
			break;

		case "getConversations":
			$conversations = [];
			$allUsers = [];

			$domainInfo = domainForID($data["domain"]);
			$tld = tldForDomain($domainInfo["domain"]);
			$getChannels = sql("SELECT * FROM `channels` WHERE `hidden` = 0");

			if ($getChannels) {
				$getUsers = sql("SELECT * FROM `domains` WHERE `claimed` = 1 AND `locked` = 0 AND `deleted` = 0 ORDER BY `domain` ASC");
				foreach ($getUsers as $key => $userData) {
					$allUsers[$userData["id"]] = [
						"domain" => $userData["domain"]
					];
				}
				
				foreach ($getChannels as $key => $info) {
					$usersForChannel = $allUsers;
					
					if (!$info["public"]) {
						$tldUsers = [];

						$theTLD = $info["name"];
						$getTLDUsers = sql("SELECT * FROM `domains` WHERE `claimed` = 1 AND `locked` = 0 AND `deleted` = 0 AND (`domain` LIKE ? OR `domain` = ?) ORDER BY `domain` ASC", ["%.".$theTLD, $theTLD]);
						if ($getTLDUsers) {
							foreach ($getTLDUsers as $key => $userData) {
								$tldUsers[$userData["id"]] = [
									"domain" => $userData["domain"]
								];
							}
						}

						$usersForChannel = $tldUsers;
					}

					$latestMessage = [];

					$getLatestMessage = @sql("SELECT * FROM `messages` WHERE `conversation` = ? ORDER BY `ai` DESC LIMIT 1", [$info["id"]])[0];
					if ($getLatestMessage) {
						$latestMessage = [
							"user" => @$getLatestMessage["user"],
							"message" => htmlentities(@$getLatestMessage["message"]),
							"time" => @$getLatestMessage["time"]
						];
					}

					if (!($info["public"] || $tld === $info["name"])) {
						if (@$latestMessage["message"]) {
							$latestMessage["message"] = "";
						}
					}

					$unseenMessages = 0;
					$unseenMentions = 0;
					$signupDate = $domainInfo["created"];
					if ($info["public"] || $tld === $info["name"]) {
						$unseenMessages = @sql("SELECT * FROM `messages` WHERE `conversation` = ? AND `user` != ? AND NOT JSON_CONTAINS(`seen`, ?, '$') AND `time` >= ? LIMIT 1", [$info["id"], $data["domain"], '"'.$data["domain"].'"', $signupDate]);
						$unseenMentions = @sql("SELECT * FROM `messages` WHERE `conversation` = ? AND `user` != ? AND NOT JSON_CONTAINS(`seen`, ?, '$') AND `time` >= ? AND `message` LIKE ? LIMIT 1", [$info["id"], $data["domain"], '"'.$data["domain"].'"', $signupDate, '%'.$data["domain"].'%']);
					}

					$conversations[$info["id"]] = [
						"group" => 1,
						"name" => $info["name"],
						"users" => $usersForChannel,
						"latestMessage" => $latestMessage,
						"unreadMessages" => $unseenMessages ? 1 : 0,
						"unreadMentions" => $unseenMentions ? 1 : 0,
						"tldadmin" => $info["tldadmin"],
						"admins" => json_decode($info["admins"], true)
					];
				}
			}

			$getConversations = sql("SELECT * FROM `conversations` WHERE JSON_CONTAINS(`users`, ?, '$')", ['"'.$data["domain"].'"']);
			if ($getConversations) {
				foreach ($getConversations as $key => $info) {
					$users = [];
					$decoded = json_decode($info["users"]);
					foreach ($decoded as $user) {
	                    $domainData = publicDataForDomainID($user);
	                    $pubkey = publicKeyForDomain($user);
	                    $domainData["pubkey"] = $pubkey;
	                    $users[$user] = $domainData;
	                }

					if ($users[$data["domain"]]["locked"]) {
						foreach ($users as $key => $user) {
							$users[$key]["locked"] = 1;
						}
					}

					$latestMessage = [];
					$getLatestMessage = @sql("SELECT * FROM `messages` WHERE `conversation` = ? ORDER BY `ai` DESC LIMIT 1", [$info["id"]])[0];
					if ($getLatestMessage) {
						$latestMessage = [
							"user" => @$getLatestMessage["user"],
							"message" => htmlentities(@$getLatestMessage["message"]),
							"time" => @$getLatestMessage["time"]
						];
					}

					$unseenMessages = @sql("SELECT * FROM `messages` WHERE `conversation` = ? AND `user` != ? AND NOT JSON_CONTAINS(`seen`, ?, '$') LIMIT 1", [$info["id"], $data["domain"], '"'.$data["domain"].'"']);

					$conversations[$info["id"]] = [
						"users" => $users,
						"latestMessage" => $latestMessage,
						"unreadMessages" => $unseenMessages ? 1 : 0,
					];
				}
			}
			$output["conversations"] = $conversations;
			break;

		case "getMessages":
			$messages = [];

			if (@$data["before"]) {
				$getFirstMessage = @sql("SELECT `id` FROM `messages` WHERE `conversation` = ? ORDER BY `ai` ASC LIMIT 1", [$data["conversation"]])[0];
				if ($getFirstMessage) {
					$firstMessage = $getFirstMessage["id"];
				}

				$getMessages = sql("SELECT `id`,`time`,`conversation`,`user`,`message`,`replying`,`reactions` FROM `messages` WHERE `conversation` = ? AND `ai` < (SELECT `ai` FROM `messages` WHERE `id` = ?) ORDER BY `ai` DESC LIMIT 50", [$data["conversation"], $data["before"]]);
			}
			else if (@$data["after"]) {
				$getMessages = sql("SELECT `id`,`time`,`conversation`,`user`,`message`,`replying`,`reactions` FROM `messages` WHERE `conversation` = ? AND `ai` > (SELECT `ai` FROM `messages` WHERE `id` = ?) ORDER BY `ai` DESC LIMIT 50", [$data["conversation"], $data["after"]]);
			}
			else {
				$getFirstMessage = @sql("SELECT `id` FROM `messages` WHERE `conversation` = ? ORDER BY `ai` ASC LIMIT 1", [$data["conversation"]])[0];
				if ($getFirstMessage) {
					$firstMessage = $getFirstMessage["id"];
				}
				
				$getMessages = sql("SELECT `id`,`time`,`conversation`,`user`,`message`,`replying`,`reactions` FROM `messages` WHERE `conversation` = ? ORDER BY `ai` DESC LIMIT 50", [$data["conversation"]]);
			}
			
			if ($getMessages) {
				foreach ($getMessages as $key => $info) {
					if (@$firstMessage && $firstMessage == $info["id"]) {
						$info["firstMessage"] = true;
					}

					if ($info["replying"]) {
						$replyingMessage = @sql("SELECT `id`,`time`,`conversation`,`user`,`message` FROM `messages` WHERE `conversation` = ? AND `id` = ? ORDER BY `ai` DESC LIMIT 50", [$data["conversation"], $info["replying"]])[0];
						if ($replyingMessage) {
							$replyingMessage["reply"] = true;
							$replyingMessage["message"] = htmlentities($replyingMessage["message"]);

							$info["replying"] = $replyingMessage;
						}
						else {
							$info["replying"] = null;
						}
					}

					$info["message"] = htmlentities($info["message"]);

					$messages[] = $info;
				}
			}

			if (!@$data["before"]) {
				$messages = array_reverse($messages);
			}
			$output["messages"] = $messages;

			$markSeen = sql("UPDATE `messages` SET `seen` = JSON_ARRAY_APPEND(`seen`, '$', ?) WHERE `conversation` = ? AND NOT JSON_CONTAINS(`seen`, ?, '$') AND `user` != ?", [$data["domain"], $data["conversation"], '"'.$data["domain"].'"', $data["domain"]]);
			break;

		case "deleteAttachment":
			$delete = sql("DELETE FROM `uploads` WHERE `id` = ? AND `session` = ?", [$data["id"], $data["key"]]);
			if ($delete) {
				unlink("/var/www/html/hnschat/uploads/".$data["id"]);
			}
			break;

		case "setPublicKey":
			$insert = sql("UPDATE `sessions` SET `pubkey` = ? WHERE `id` = ? AND `pubkey` IS NULL", [$data["pubkey"], $data["key"]]);
			break;

		case "getPublicKey":
			$getKey = sql("SELECT `pubkey` FROM `sessions` WHERE `id` = ? AND `pubkey` IS NOT NULL", [$data["key"]])[0];
			if ($getKey) {
				$output["pubkey"] = $getKey["pubkey"];
			}
			break;

		case "verifySession":
			$checkSession = sql("SELECT * FROM `sessions` WHERE `id` = ? AND `pubkey` = ?", [$data["key"], $data["pubkey"]]);
			if (!$checkSession) {
				error("This session is invalid.");
			}
			break;

		case "checkName":
			$domainData = @publicDataForDomainID(@$data["from"]);

			if ($domainData) {
				if ($domainData["domain"] === $data["domain"]) {
					error("Send a message to hnschat/ if you want to test :P");
				}
			}

			if (strlen($data["domain"]) < 1) {
				error("Well that can't be right.");
			}
			
			$getDomain = sql("SELECT * FROM `domains` WHERE `domain` = ? AND `claimed` = 1 AND `locked` = 0", [$data["domain"]]);
			if (!$getDomain) {
				error("This name is not either not claimed or not available right now.");
			}
			break;

		case "getMetaTags":
			$checkCache = @sql("SELECT `id`, `link`, `title`, `description`, `image` FROM `previews` WHERE `link` = ?", [$data["url"]])[0];
			if ($checkCache) {
				unset($checkCache["link"]);

				foreach ($checkCache as $key => $value) {
					if (!$value) {
						unset($checkCache[$key]);
					}
				}

				$tags = $checkCache;
			}
			else {
				$tags = fetchMetaTags($data["url"]);
			}
			
			if (@$tags["id"]) {
				if (@$tags["title"]) {
					$output["tags"] = $tags;
				}

				if (@$output["tags"]["image"]) {
					$output["tags"]["image"] = "/preview/".$tags["id"];
				}
			}
			break;

		case "getAddress":
			$domainInfo = domainForID($data["domain"]);

			$getAddress = fetchAddress($domainInfo["domain"]);
			if (!$getAddress) {
				error("This user isn't currently accepting payments.");
			}

			$output["address"] = trim($getAddress);
			break;

		case "saveSettings":
			$settings = json_decode($data["settings"], true);
			
			$domainInfo = domainForID($data["domain"]);
			$tld = tldForDomain($domainInfo["domain"]);

			if (@$settings["avatar"]) {
				if (in_array($tld, $allSpecialDomains)) {
					$settings["avatar"] = trim($settings["avatar"]);

					if (!validImage($settings["avatar"])) {
						error("The Avatar URL provided isn't a valid image.");
					}

					sql("UPDATE `domains` SET `avatar` = ? WHERE `id` = ? AND `session` = ?", [$settings["avatar"], $data["domain"], $data["key"]]);

					$output["avatar"] = $settings["avatar"];
				}
				else {
					error("Only SLD's of staked TLD's can set an Avatar here.");
				}
			}

			if (@$settings["address"]) {
				if (in_array($tld, $fullyStakedDomains)) {
					$settings["address"] = trim($settings["address"]);
					
					if (!validateAddress($settings["address"])) {
						error("The HNS Address provided isn't valid.");
					}

					sql("UPDATE `domains` SET `address` = ? WHERE `id` = ? AND `session` = ?", [$settings["address"], $data["domain"], $data["key"]]);
				}
				else {
					error("Only SLD's of certain staked TLD's can set an address here.");
				}
			}
			break;

		case "createPoll":
			$insertPoll = sql("INSERT INTO `polls` (type,user,name,channel,private,description,tweet,time) VALUES (?,?,?,?,?,?,?,?)", [$data["type"], $data["user"], strtolower($data["name"]), $data["channel"], $data["private"], $data["description"], $data["tweet"], time()]);
			if (!$insertPoll) {
				error("Something went wrong :/");
			}
			break;

		case "createChannel":
			$data["name"] = strtolower($data["name"]);
			$channelID = generateCode("channel");
			$admins = json_encode([$data["user"]]);

			$domainInfo = domainForID($data["user"]);
			if ($data["tldadmin"] && $domainInfo["domain"] == $data["name"]) {
				$admins = '[]';
			}

			$validate = preg_match("/^(?:[A-Za-z0-9][A-Za-z0-9\-]{0,61}[A-Za-z0-9]|[A-Za-z0-9])$/", $data["name"], $match);
			if (!$match) {
				error("A channel name can only contain letters, numbers, and hyphens, but can't start or end with a hyphen.");
			}

			if (channelForName($data["name"])) {
				error("A channel name with this name already exists.");
			}

			$fee = $channelPrice.".".generateNumber(6);
			$insertChannel = sql("INSERT INTO `channels` (id,name,public,tldadmin,admins,fee,created,hidden) VALUES (?,?,?,?,?,?,?,?)", [$channelID, $data["name"], $data["public"], $data["tldadmin"], $admins, $fee, time(), 1]);
			if (!$insertChannel) {
				error($admins);
			}

			$output["id"] = $channelID;
			$output["fee"] = $fee;
			break;

		case "receivedPayment":
			$channelInfo = channelForID($data["channel"]);

			if (@$data["amount"]) {
				if ($data["amount"] != $channelInfo["fee"]) {
					error("That's not the right amount.");
				}
			}

			$validate = preg_match("/^(?:[a-z0-9]{64})$/", $data["tx"], $match);
			if (!$match) {
				error("Something is wrong with that transaction.");
			}

			$addTX = sql("UPDATE `channels` SET `tx` = ? WHERE `id` = ?", [$data["tx"], $data["channel"]]);
			if (!$addTX) {
				error("Something went wrong :/");
			}
			break;

		default:
			error("Not sure what you're trying to do...");
			break;
	}

	die(json_encode($output));
?>