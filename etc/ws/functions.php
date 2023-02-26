<?php
	function loadClasses() {
		$dir = "/var/www/html/hnschat/etc/ws/classes/";
		$files = scandir($dir);

		foreach ($files as $file) {
			if (pathinfo($file)["extension"] === "php") {
				include $dir.$file;
			}
		}
	}

	function connectRedis() {
        $GLOBALS["redis"] = new Redis();

        echo "Connecting to Redis...\n";
        $connectRedis = $GLOBALS["redis"]->connect('127.0.0.1');
        
        if ($connectRedis) {
            echo "Connected to Redis!\n";
        }
        else {
            echo "Error connecting to Redis!\n";
            die();
        }
    }

    function loadEmojis() {
        $emojiFile = "/var/www/html/hnschat/assets/js/emojis.js";
        $emojiJSON = file_get_contents($emojiFile);
        $emojis = preg_replace("/^\/\/ (.|\w|\s)+?(?=\[)/", "", $emojiJSON);
        $decoded = json_decode($emojis, true);

        $GLOBALS["emojis"] = $decoded;
    }

    function validReaction($emoji) {
        foreach ($GLOBALS["emojis"] as $key => $data) {
            if ($data["emoji"] === $emoji) {
                return true;
            }
        }

        return false;
    }

    function parse($from, $message) {
        preg_match("/(?<command>[A-Z]+)\s(?<body>.+)/", $message, $parsed);

        $command = $parsed["command"];
        $body = $parsed["body"];

        /* ONLY IDENTIFY COMMAND IF NOT IDENTIFIED */
        switch ($command) {
            case "IDENTIFY":
                break;

            default:
                $user = Users::userForID($from->resourceId);
                if (!@$user->session) {
                    return 2;
                }
                break;
        }

        /* ACTUALLY PARSE */
        switch ($command) {
            case "IDENTIFY":
                $getUser = @sql("SELECT * FROM `sessions` WHERE `id` = ?", [$body])[0];
                if ($getUser) {
                    $id = $getUser["id"];
                    $domains = domainIDSForSession($body);

                    $user = Users::new($from, $id, $domains);

                    $conversations = [];
                    foreach ($domains as $domain) {
                        $getChannels = sql("SELECT * FROM `channels`");
                        if ($getChannels) {
                            foreach ($getChannels as $key => $data) {
                                $conversation = Conversations::conversationForID($data["id"]);
                                $conversation->addUser($user);
                                $user->addConversation($conversation);
                            }
                        }

                        $getConversations = sql("SELECT * FROM `conversations` WHERE JSON_CONTAINS(`users`, ?, '$')", ['"'.$domain.'"']);
                        if ($getConversations) {
                            foreach ($getConversations as $key => $data) {
                                $conversation = Conversations::conversationForID($data["id"]);
                                $conversation->addUser($user);
                                $user->addConversation($conversation);
                            }
                        }
                    }
                    /*
                    $verifiedDomains = verifyDomains($domains);
                    $locked = $verifiedDomains["bad"];
                    if ($locked) {
                        $from->send("LOCKED ".json_encode($locked));
                    }
                    */
                }
                break;

            case "ACTION":
                $data = json_decode($body, true);
                handle($from, $data);
                break;
            
            default:
                break;
        }
    }

    function handle($from, $data) {
        foreach ($data as $key => $value) {
            $data[$key] = trim($value);
        }

        /* PREVENT STUFF */
        switch ($data["action"]) {
            case "startConversation":
            case "sendMessage":
            case "typing":
            case "react":
                $domain = publicDataForDomainID($data["from"]);
                if ($domain["locked"]) {
                    return 2;
                }
                break;
        }

        /* VERIFY PERMISSIONS */
        switch ($data["action"]) {
            case "startConversation":
                $domains = Users::userForID($from->resourceId)->domains;
                if (!in_array($data["from"], $domains)) {
                    return 2;
                }
                break;

            case "sendMessage":
            case "markSeen":
            case "react":
                $conversations = [];
                $getConversations = Users::userForID($from->resourceId)->conversations;
                foreach ($getConversations as $conversation) {
                    $conversations[] = $conversation->id;
                }
                if (!in_array($data["conversation"], $conversations)) {
                    return 2;
                }
                break;

            case "typing":
                $domains = Users::userForID($from->resourceId)->domains;
                if (!in_array($data["from"], $domains)) {
                    return 2;
                }

                $conversations = [];
                $getConversations = Users::userForID($from->resourceId)->conversations;
                foreach ($getConversations as $conversation) {
                    $conversations[] = $conversation->id;
                }
                if (!in_array($data["to"], $conversations)) {
                    return 2;
                }
                break;
        }

        /* PREVENT EXTERNAL MESSAGES */
        switch ($data["action"]) {
            case "typing":
            case "sendMessage":
            case "react":
                if ($data["action"] === "typing") {
                    $conversation = $data["to"];
                }
                else {
                    $conversation = $data["conversation"];
                }

                $channelInfo = channelForID($conversation);
                $domainInfo = domainForID($data["from"]);
                if ($channelInfo) {
                    if ($channelInfo["hidden"]) {
                        return 2;
                    }
                    
                    if (!$channelInfo["public"]) {
                        $getChannelUser = sql("SELECT * FROM `domains` WHERE `claimed` = 1 AND `locked` = 0 AND `deleted` = 0 AND (`domain` LIKE ? OR `domain` = ?) AND `id` = ?", ["%.".$channelInfo["name"], $channelInfo["name"], $data["from"]]);
                        if (!$getChannelUser && $domainInfo["domain"] !== "hnschatbot") {
                            return 2;
                        }
                    }
                }
                break;
        }

        /* DO STUFF */
        switch ($data["action"]) {
            case "startConversation":
                $conversation = [];

                $data["to"] = trim(strtolower($data["to"]), ". /");
                $to = idForUnlockedDomain($data["to"]);

                if ($to) {
                    $a = '["'.$data["from"].'","'.$to.'"]';
                    $b = '["'.$to.'","'.$data["from"].'"]';
                    $getConversation = @sql("SELECT * FROM `conversations` WHERE `users` = ? OR `users` = ?", [$a, $b])[0];
                    if (!$getConversation) {
                        $id = generateCode("conversation");
                        sql("INSERT INTO `conversations` (id, users) VALUES (?,?)", [$id, $a]);
                        $getConversation = @sql("SELECT * FROM `conversations` WHERE `users` = ? OR `users` = ?", [$a, $b])[0];
                    }

                    if ($getConversation) {
                        $users = [];
                        $decoded = json_decode($getConversation["users"]);
                        foreach ($decoded as $user) {
                            $domainData = publicDataForDomainID($user);
                            $pubkey = publicKeyForDomain($user);
                            $domainData["pubkey"] = $pubkey;
                            $users[$user] = $domainData;
                        }

                        if ($users[$data["from"]]["locked"]) {
                            foreach ($users as $key => $user) {
                                $users[$key]["locked"] = 1;
                            }
                        }

                        $conversation = [
                            "id" => $getConversation["id"],
                            "users" => $users,
                            "latestMessage" => []
                        ];
                    }

                    $usersToSend = [];
                    $c = Conversations::new($conversation["id"]);
                    $conversationUsers = $conversation["users"];

                    foreach ($conversationUsers as $key => $user) {
                        $theUser = idForUnlockedDomain($user["domain"]);
                        $getSession = sessionForDomain($theUser);

                        if (@$getSession) {
                            $users = Users::usersForSession($getSession);

                            foreach ($users as $key => $u) {
                                $c->addUser($u);
                                $u->addConversation($c);
                                $usersToSend[$u->id] = $u;
                            }
                        }
                    }

                    if (count($usersToSend)) {
                        foreach ($usersToSend as $key => $user) {
                            $user->socket->send("CONVERSATION ".json_encode($conversation));
                        }
                    }
                }
                break;

            case "sendMessage":
                if (@strlen($data["message"])) {
                    switch (strlen($data["conversation"])) {
                        case 8:
                            $getConversation = sql("SELECT * FROM `channels` WHERE `id` = ?", [$data["conversation"]])[0];

                            if (!Users::allUsersContains($data["from"])) {
                                Users::updateAllUsers();
                                Users::sendAllUsers();
                            }
                            break;

                        case 16:
                            $getConversation = sql("SELECT * FROM `conversations` WHERE `id` = ? AND JSON_CONTAINS(`users`, ?, '$')", [$data["conversation"], '"'.$data["from"].'"'])[0];
                            break;

                        default:
                            break;
                    }

                    if ($getConversation) {
                        $message = [
                            "id" => generateCode("message"),
                            "time" => time(), 
                            "conversation" => $data["conversation"], 
                            "user" => $data["from"], 
                            "message" => htmlentities($data["message"]),
                            "reply" => 0,
                            "replying" => @$data["replying"],
                            "reactions" => "{}"
                        ];

                        if (@$data["replying"]) {
                            $message["reply"] = 1;
                            $getOriginalMessage = @sql("SELECT `id`,`time`,`conversation`,`user`,`message`,`replying` FROM `messages` WHERE `id` = ? AND `conversation` = ?", [$data["replying"], $data["conversation"]])[0];
                            if (!$getOriginalMessage) {
                                $message["replying"] = NULL;
                            }
                        }

                        if (@$data["signature"]) {
                            $domain = publicDataForDomainID($data["from"])["domain"];
                            $verifySignature = verifySignature($domain, $data["signature"], $data["message"]);
                        }

                        $message["signed"] = @$verifySignature ? 1 : 0;
                        $message["signature"] = @$data["signature"] ? $data["signature"] : NULL;
                        $insertMessage = sql("INSERT INTO `messages` (id, time, conversation, user, message, reply, replying, reactions, signed, signature) VALUES (?,?,?,?,?,?,?,?,?,?)", array_values($message));

                        if ($insertMessage) {
                            $message["message"] = htmlentities($message["message"]);

                            $message["replying"] = @$getOriginalMessage ? $getOriginalMessage : NULL;
                            if ($message["replying"]) {
                                $message["replying"]["message"] = htmlentities($message["replying"]["message"]);
                            }

                            $conversation = Conversations::conversationForID($data["conversation"]);
                            if ($conversation) {
                                $isChannel = false;
                                if (strlen($data["conversation"]) == 8) {
                                    $channelInfo = channelForID($data["conversation"]);
                                    $channelName = $channelInfo["name"];
                                    $isChannel = true;
                                    $isPublic = $channelInfo["public"];
                                }
                                else {
                                    $conversationInfo = conversationForID($data["conversation"]);
                                    $conversationUsers = json_decode($conversationInfo["users"]);
                                }

                                if ($isChannel && !$isPublic) {
                                    foreach (Conversations::conversationForID($data["conversation"])->users as $user) {
                                        $hasAccess = false;

                                        foreach ($user->domains as $key => $domain) {
                                            $domainInfo = domainForID($domain);
                                            $tld = tldForDomain($domainInfo["domain"]);
                                            
                                            if ($tld == $channelName || $tld == "hnschatbot") {
                                                $hasAccess = true;
                                                break;
                                            }
                                        }

                                        if ($hasAccess) {
                                            if (in_array($data["from"], $user->domains)) {
                                                $user->setTyping(false);
                                            }
                                            $user->socket->send("MESSAGE ".json_encode($message));
                                        }
                                    }
                                }
                                else {
                                    $activeUsers = Users::active();
                                    $notifyUsers = array_diff($conversationUsers, [$data["from"]]);
                                    $notifyUsers = array_diff($notifyUsers, $activeUsers);

                                    foreach (Conversations::conversationForID($data["conversation"])->users as $user) {
                                        if (in_array($data["from"], $user->domains)) {
                                            $user->setTyping(false);
                                            $notifyUsers = array_diff($notifyUsers, $user->domains);
                                        }
                                        $user->socket->send("MESSAGE ".json_encode($message));
                                    }

                                    if ($notifyUsers) {
                                        foreach ($notifyUsers as $user) {
                                            $pushDomainInfo = domainForID($user);
                                            var_dump("SHOULD PUSH NOTIFICATION TO ".$pushDomainInfo["domain"]);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                break;

            case "markSeen":
                $markSeen = sql("UPDATE `messages` SET `seen` = JSON_ARRAY_APPEND(`seen`, '$', ?) WHERE `id` = ? AND `conversation` = ? AND NOT JSON_CONTAINS(`seen`, ?, '$') AND `user` != ?", [$data["domain"], $data["id"], $data["conversation"], '"'.$data["domain"].'"', $data["domain"]]);
                break;

            case "ping":
                Users::userForID($from->resourceId)->setPing($data["from"], time());
                break;

            case "typing":
                Users::userForID($from->resourceId)->setTyping(true, $data["from"], $data["to"], time());
                break;

            case "react":
                if (!validReaction(@$data["reaction"])) {
                    break;
                }

                $getReactions = @sql("SELECT `reactions` FROM `messages` WHERE `id` = ?", [$data["message"]])[0];
                if (!$getReactions) {
                    $reactions = [];
                }

                $reactions = json_decode($getReactions["reactions"], true);
                if (!$reactions) {
                    $reactions = [];
                }

                if (@in_array($data["from"], @$reactions[$data["reaction"]])) {
                    $new = [];

                    foreach ($reactions[$data["reaction"]] as $key => $value) {
                        if ($value !== $data["from"]) {
                            array_push($new, $value);
                        }
                    }

                    $reactions[$data["reaction"]] = $new;
                }
                else {
                    if (!@count(@$reactions[$data["reaction"]])) {
                        $reactions[$data["reaction"]] = [];
                    }
                    array_push($reactions[$data["reaction"]], $data["from"]);
                }

                foreach ($reactions as $key => $value) {
                    if (!count($value)) {
                        unset($reactions[$data["reaction"]]);
                    }
                }

                $encoded = json_encode($reactions);
                $react = sql("UPDATE `messages` SET `reactions` = ? WHERE `id` = ?", [$encoded, $data["message"]]);
                if ($react) {
                    $conversation = Conversations::conversationForID($data["conversation"]);
                    if ($conversation) {
                        $isChannel = false;
                        if (strlen($data["conversation"]) == 8) {
                            $channelInfo = channelForID($data["conversation"]);
                            $channelName = $channelInfo["name"];
                            $isChannel = true;
                            $isPublic = $channelInfo["public"];
                        }

                        if ($isChannel && !$isPublic) {
                            foreach (Conversations::conversationForID($data["conversation"])->users as $user) {
                                $hasAccess = false;

                                foreach ($user->domains as $key => $domain) {
                                    $domainInfo = domainForID($domain);
                                    $tld = tldForDomain($domainInfo["domain"]);
                                    
                                    if ($tld == $channelName) {
                                        $hasAccess = true;
                                        break;
                                    }
                                }

                                if ($hasAccess) {
                                    unset($data["action"]);
                                    $user->socket->send("REACTION ".json_encode($data));
                                }
                            }
                        }
                        else {
                            foreach (Conversations::conversationForID($data["conversation"])->users as $user) {
                                unset($data["action"]);
                                $user->socket->send("REACTION ".json_encode($data));
                            }
                        }
                    }
                }
                break;

            case "deleteMessage":
                $messageInfo = @sql("SELECT * FROM `messages` WHERE `id` = ?", [$data["message"]])[0];
                $channelInfo = channelForID($messageInfo["conversation"]);
                $channelName = $channelInfo["name"];
                $domainInfo = domainForID($data["domain"]);
                $channelAdmins = json_decode($channelInfo["admins"], true);

                if (($channelInfo["tldadmin"] && $domainInfo["domain"] === $channelName) || $domainInfo["admin"] || in_array($data["domain"], $channelAdmins)) {
                    $latestMessage = @sql("SELECT * FROM `messages` WHERE `conversation` = ? ORDER BY `ai` DESC LIMIT 1", [$messageInfo["conversation"]])[0];
                    
                    $isLatest = false;
                    if ($latestMessage) {
                        if ($latestMessage["id"] == $data["message"]) {
                            $isLatest = true;
                        }
                    }

                    $deleteMessage = sql("DELETE FROM `messages` WHERE `id` = ?", [$data["message"]]);
                    if ($deleteMessage) {
                        foreach (Conversations::conversationForID($messageInfo["conversation"])->users as $user) {
                            $hasAccess = false;

                            if ($channelInfo["public"]) {
                                $hasAccess = true;
                            }
                            else {
                                foreach ($user->domains as $key => $domain) {
                                    $userInfo = domainForID($domain);
                                    $tld = tldForDomain($userInfo["domain"]);
                                    
                                    if ($tld == $channelName) {
                                        $hasAccess = true;
                                        break;
                                    }
                                }
                            }

                            if ($hasAccess) {
                                unset($data["domain"]);
                                $data["conversation"] = $messageInfo["conversation"];

                                if ($isLatest) {
                                    $latestMessage = @sql("SELECT * FROM `messages` WHERE `conversation` = ? ORDER BY `ai` DESC LIMIT 1", [$messageInfo["conversation"]])[0];

                                    if ($latestMessage) {
                                        $data["latestMessage"] = [
                                            "message" => $latestMessage["message"],
                                            "time" => $latestMessage["time"],
                                            "user" =>$latestMessage["user"]
                                        ];
                                    }
                                }

                                $user->socket->send("DELETE ".json_encode($data));
                            }
                        }
                    }
                }
                break;
            
            default:
                break;
        }
    }
?>