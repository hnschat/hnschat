<?php
	function error($message) {
		$output = [
			"success" => false,
			"message" => $message
		];

		if (@$GLOBALS["needSLD"]) {
			$output["needSLD"] = true;
		}

		if (@$GLOBALS["unverified"]) {
			$output["unverified"] = true;
		}

		die(json_encode($output));
	}

	function generateID($length) {
		$alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
	    $pass = array();
	    $alphaLength = strlen($alphabet) - 1;
	    for ($i = 0; $i < $length; $i++) {
	        $n = rand(0, $alphaLength);
	        $pass[] = $alphabet[$n];
	    }
	    return implode($pass);
	}

	function generateNumber($length) {
		$alphabet = '123456789';
	    $pass = array();
	    $alphaLength = strlen($alphabet) - 1;
	    for ($i = 0; $i < $length; $i++) {
	        $n = rand(0, $alphaLength);
	        $pass[] = $alphabet[$n];
	    }
	    return implode($pass);
	}

	function generateCode($type) {
		switch ($type) {
			case "session":
				$db = "sessions";
				$param = "id";
				$length = 32;
				break;

			case "domain":
				$db = "domains";
				$param = "id";
				$length = 16;
				break;
			
			case "code":
				$db = "domains";
				$param = "code";
				$length = 32;
				break;

			case "channel":
				$db = "channels";
				$param = "id";
				$length = 8;
				break;

			case "conversation":
				$db = "conversations";
				$param = "id";
				$length = 16;
				break;

			case "message":
				$db = "messages";
				$param = "id";
				$length = 32;
				break;

			case "upload":
				$db = "uploads";
				$param = "id";
				$length = 32;
				break;

			case "preview":
				$db = "previews";
				$param = "id";
				$length = 16;
				break;

			default:
				return;
		}

		tryAgain:
		$id = generateID($length);

		$checkExists = sql("SELECT * FROM `".$db."` WHERE `".$param."` = ?", [$id]);
		if ($checkExists) {
			goto tryAgain;
		}
		
		return $id;
	}

	function guidv4($data) {
	    assert(strlen($data) == 16);

	    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // set version to 0100
	    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // set bits 6-7 to 10

	    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
	}

	function getUsers($allSpecialDomains=[]) {
		$users = [];

		$getUsers = sql("SELECT * FROM `domains` ORDER BY `domain` ASC");
		foreach ($getUsers as $key => $userData) {
			$data = [
				"id" => $userData["id"],
				"domain" => $userData["domain"],
				"locked" => $userData["locked"],
			];
			
			if (@$userData["avatar"]) {
				$data["avatar"] = $userData["avatar"];
			}

			if (@$userData["admin"]) {
				$data["admin"] = $userData["admin"];
			}

			$tld = tldForDomain($userData["domain"]);
			if ($tld && in_array($tld, $allSpecialDomains)) {
				$data["tld"] = $tld;
			}

			$users[] = $data;
		}

		return $users;
	}

	function getStats($type) {
		switch ($type) {
			case "sessions":
				$get = sql("SELECT * FROM `sessions`");
				break;

			case "totalNames":
				$get = sql("SELECT * FROM `domains`");
				break;

			case "verifiedNames":
				$get = sql("SELECT * FROM `domains` WHERE `code` IS NOT NULL AND `claimed` = 1 AND `locked` = 0 AND `deleted` = 0");
				break;

			case "sld":
				$get = sql("SELECT * FROM `domains` WHERE `code` IS NULL AND `deleted` = 0");
				break;

			case "unverifiedNames":
				$get = sql("SELECT * FROM `domains` WHERE `code` IS NOT NULL AND `claimed` = 1 AND `locked` = 1 AND `deleted` = 0");
				break;

			case "deletedNames":
				$get = sql("SELECT * FROM `domains` WHERE `deleted` = 1");
				break;

			case "channels":
				$get = sql("SELECT * FROM `channels`");
				break;

			case "conversations":
				$get = sql("SELECT * FROM `conversations`");
				break;

			case "messages":
				$get = sql("SELECT * FROM `messages` WHERE `conversation` != 'T4McaFXy'");
				break;

			case "unique":
				$get = sql("SELECT COUNT(*) AS `Rows`, `session` FROM `domains` WHERE `claimed` = 1 AND `locked` = 0 AND `deleted` = 0 GROUP BY `session` ORDER BY `Rows` DESC");
				break;
			
			default:
				break;
		}
		$count = count($get);
		return number_format($count);
	}

	function channelForName($name) {
		$getChannel = @sql("SELECT * FROM `channels` WHERE `name` = ?", [$name]);
		if ($getChannel) {
			return $getChannel[0];
		}

		return false;
	}

	function channelForID($id) {
		$getChannel = @sql("SELECT * FROM `channels` WHERE `id` = ?", [$id]);
		if ($getChannel) {
			return $getChannel[0];
		}

		return false;
	}

	function conversationForID($id) {
		$getConversation = @sql("SELECT * FROM `conversations` WHERE `id` = ?", [$id]);
		if ($getConversation) {
			return $getConversation[0];
		}

		return false;
	}

	function sessionForDomain($id) {
		$getSession = @sql("SELECT `session` FROM `domains` WHERE `id` = ?", [$id])[0];
		if ($getSession) {
			return $getSession["session"];
		}

		return false;
	}

	function idForUnclaimedDomain($domain) {
		$getDomain = @sql("SELECT `id` FROM `domains` WHERE `domain` = ? AND `session` IS NULL", [$domain])[0];
		if ($getDomain) {
			return $getDomain["id"];
		}

		return false;
	}

	function idForUnlockedDomain($domain) {
		$getDomain = @sql("SELECT `id` FROM `domains` WHERE `domain` = ? AND `locked` = 0", [$domain])[0];
		if ($getDomain) {
			return $getDomain["id"];
		}

		return false;
	}

	function domainsForSession($id) {
		$domains = [];

		$getDomains = @sql("SELECT * FROM `domains` WHERE `session` = ? AND `deleted` = 0 ORDER BY `domain` ASC", [$id]);
		if ($getDomains) {
			return $getDomains;
		}

		return $domains;
	}

	function domainIDSForSession($id) {
		$domains = [];
		$getDomains = domainsForSession($id);
		if ($getDomains) {
			foreach ($getDomains as $key => $info) {
				$domains[] = $info["id"];
			}
		}

		return $domains;
	}

	function unlockedDomainIDSForSession($id) {
		$domains = [];
		$getDomains = domainsForSession($id);
		if ($getDomains) {
			foreach ($getDomains as $key => $info) {
				if (!$info["locked"]) {
					$domains[] = $info["id"];
				}
			}
		}

		return $domains;
	}

	function isDomainInSession($domain, $key) {
		$getDomain = @sql("SELECT `id` FROM `domains` WHERE `id` = ? AND `session` = ? AND `deleted` = 0", [$domain, $key]);

		if ($getDomain) {
			return true;
		}

		return false;
	}

	function domainForID($id) {
		$getDomain = @sql("SELECT * FROM `domains` WHERE `id` = ?", [$id])[0];
		if ($getDomain) {
			return $getDomain;
		}

		return false;
	}

	function dataForDomainID($id) {
		$getDomain = @sql("SELECT * FROM `domains` WHERE `id` = ?", [$id])[0];
		if ($getDomain) {
			return $getDomain;
		}

		return false;
	}

	function publicDataForDomainID($id) {
		$getDomain = @sql("SELECT `domain`,`claimed`,`locked` FROM `domains` WHERE `id` = ?", [$id])[0];
		if ($getDomain) {
			return $getDomain;
		}

		return false;
	}

	function publicKeyForDomain($domain) {
		$session = sessionForDomain($domain);
		$getPubKey = sql("SELECT `pubkey` FROM `sessions` WHERE `id` = ?", [$session])[0];
		if ($getPubKey) {
			return $getPubKey["pubkey"];
		}
		return false;
	}

	function hsdRunning() {
		$response = @shell_exec("/root/hsd/bin/hsd-cli info");
		$json = @json_decode($response, true);
		if (@$json["chain"]["progress"] == 1) {
			return true;
		}
		return false;
	}

	function verifyDomains($domains) {
		$good = [];
		$bad = [];

		foreach ($domains as $key => $domain) {
			$domainInfo = domainForID($domain);

			if (!$domainInfo["locked"]) {
				if (@$domainInfo["code"]) {
					$verify = verifyCode($domainInfo["id"], $domainInfo["code"]);
					if (@$verify["success"]) {
						$good[] = $domain;
					}
					else {
						sql("UPDATE `domains` SET `locked` = 1 WHERE `id` = ?", [$domain]);
						$bad[] = $domain;
					}
				}
				else {
					$good[] = $domain;
				}
			}
		}

		return [
			"good" => $good,
			"bad" => $bad
		];
	}

	function verifyCode($id, $code) {
		$output = [];
		$success = false;

		$getDomain = domainForID($id);

		if ($getDomain) { 
			$domain = $getDomain["domain"];

			if ($getDomain["signature"]) {
				if (verifySignature($domain, $getDomain["signature"], "hns-chat=".$getDomain["code"], @$getDomain["eth"])) {
					$success = true;
					goto skip;
				}
			}

			$dnsServer = "127.0.0.44";
			$verifyEthereum = domainIsEthereum($domain);
			if ($verifyEthereum) {
				$dnsServer = "127.0.0.1 -p 5123";
			}

			$getRecords = shell_exec("dig @".$dnsServer." +noall +answer +noidnin +noidnout ".escapeshellarg($domain)." TXT");
			preg_match_all("/(?<domain>.+)\..+?(?<ttl>[0-9]+?)\s.+TXT\s\"(?<value>.+)\"/", $getRecords, $matches);

			if ($matches) {
				foreach ($matches["domain"] as $key => $data) {
					if ($data === $domain) {
						$ttl = $matches["ttl"][$key];
						$value = $matches["value"][$key];
						$split = explode(";", $value);

						foreach ($split as $key => $v) {
							if (substr($v, 0, 9) === "hns-chat=") {
								if ($v === "hns-chat=".$code) {
									$success = true;
									goto skip;
								}
								else {
									if ($domain === "e.xp") {
										$error = [
											"ttl" => $ttl
										];
									}
								}
							}
						}
					}
				}
			}

			if (strpos($domain, ".") == false) {
				$data = [
					"method" => "getnameresource",
					"params" => [$domain],
				];
				$response = queryHSD($data);

				if ($response) {
					$records = @$response["records"];
					if ($records) {
						foreach ($records as $key => $record) {
							if ($record["type"] === "TXT") {
								$value = $record["txt"][0];

								if ($value === "hns-chat=".$code) {
									$success = true;
									goto skip;
								}
							}
						}
					}
				}
			}
		}

		skip:
		$output["success"] = $success;
		if (!$success) {
			@$output["error"] = $error;
		}

		return $output;
	}

	function verifySignature($domain, $signature, $message, $account=false) {
		if (domainIsEthereum($domain)) {
			if ($domain && $signature && $message && $account) {
				$data = [
					"domain" => $domain,
					"code" => $message,
					"account" => $account,
					"signature" => $signature,
				];

				$query = base64_encode(json_encode($data));
				$result = exec("node /var/www/html/hnschat/etc/ens.js -d ".$query);

				if ($result === "true") {
					return true;
				}
			}
		}
		else {
			$data = [
				"method" => "verifymessagewithname",
				"params" => [$domain, $signature, $message],
			];
			$response = queryHSD($data);

			if ($response) {
				if (@$response) {
					return true;
				}
			}

			return false;
		}
		
		return false;
	}

	function verifyTransaction($tx, $amount) {
		$amount = preg_replace("/[^0-9]/", "", $amount);
		$address = "hs1qf0cxy6ukhgjlmqfhe0tpw800t2tcul4s0szwqa";

		$response = queryHSW("/wallet/hnschat-hip-2/tx/".$tx);
		foreach (@$response["outputs"] as $key => $output) {
			if (@$response["confirmations"] >= 1 && $output["value"] == $amount && $output["address"] = $address) {
				return true;
			}
		}

		return false;
	}

	function tldForDomain($domain) {
		$split = explode(".", $domain);
		$tld = end($split);

		return $tld;
	}

	function domainIsHandshake($domain) {
		$tld = tldForDomain($domain);
		
		$data = [
			"method" => "getnameinfo",
			"params" => [$tld],
		];
		$response = queryHSD($data);

		if ($response) {
			if (@$response["info"]["owner"]["hash"]) {
				return true;
			}
		}

		return false;
	}

	function domainIsEthereum($domain) {
		$tld = tldForDomain($domain);

		if ($tld === "eth") {
			return true;
		}
		else {
			$data = [
				"method" => "getnameresource",
				"params" => [$tld],
			];
			$response = queryHSD($data);

			if ($response) {
				$records = @$response["records"];
				if ($records) {
					foreach ($records as $key => $record) {
						if ($record["type"] === "NS") {
							$value = trim($record["ns"], ". ");
							$end = substr($value, -5);

							if ($end === "._eth") {
								return true;
							}
						}
					}
				}
			}
		}
		return false;
	}

	function fetchRecords($domain) {
		if ($domain) {
			if (strpos($domain, ".") == false) {
				$data = [
					"method" => "getnameresource",
					"params" => [$domain],
				];
				$response = queryHSD($data);

				if ($response) {
					$records = @$response["records"];
					if ($records) {
						return $records;
					}
				}
			}
		}
		return false;
	}

	function top10() {
		$top = [];

		$users = sql("SELECT COUNT(*) AS `Rows`, `user` FROM `messages` GROUP BY `user` ORDER BY `Rows` DESC LIMIT 10");

		foreach ($users as $key => $data) {
			$domainInfo = domainForID($data["user"]);

			array_push($top, $domainInfo["domain"]);
		}

		return $top;
	}

	function avatarFromTXT($content) {
		if ((substr($content, 0, 7) === "avatar=" || substr($content, 0, 15) === "profile avatar=")) {
			if (substr($content, 0, 15) === "profile avatar=") {
				$avatar = substr($content, 15);
			}
			else {
				$avatar = substr($content, 7);
			}
		}

		if (!filter_var(@$avatar, FILTER_VALIDATE_URL) === false) {
			return $avatar;
		}

		return false;
	}

	function fetchAvatar($domain) {
		if ($domain) {
			$getRecords = shell_exec("dig @127.0.0.44 +noall +answer +noidnin +noidnout ".escapeshellarg($domain)." TXT");
			preg_match_all("/(?<domain>.+)\..+TXT\s\"(?<value>.+)\"/", $getRecords, $matches);

			if ($matches) {
				foreach ($matches["domain"] as $key => $data) {
					if ($data === $domain) {
						$value = $matches["value"][$key];

						$avatar = avatarFromTXT($value);
						if ($avatar) {
							return $avatar;
						}
					}
				}
			}

			if (strpos($domain, ".") == false) {
				$data = [
					"method" => "getnameresource",
					"params" => [$domain],
				];
				$response = queryHSD($data);

				if ($response) {
					$records = @$response["records"];
					if ($records) {
						foreach ($records as $key => $record) {
							if (@$record["txt"]) {
								$content = @$record["txt"][0];

								$avatar = avatarFromTXT($content);
								if ($avatar) {
									return $avatar;
								}
							}
						}
					}
				}
			}
		}

		return false;
	}

	function validImage($url) {
		$string = getContents($url);
		if ($string) {
			$id = generateID(16);
			$file = "/tmp/".$id;
			$f = fopen($file, 'wb');
			fputs($f, $string);
			fclose($f);
			$size = getimagesize($file);
			unlink($file);
		}
		return (strtolower(substr(@$size['mime'], 0, 5)) == 'image' ? true : false);  
	}

	function validImageWithoutFetch($string) {
		if ($string) {
			$id = generateID(16);
			$file = "/tmp/".$id;
			$f = fopen($file, 'wb');
			fputs($f, $string);
			fclose($f);
			$size = getimagesize($file);
			unlink($file);
		}
		return (strtolower(substr(@$size['mime'], 0, 5)) == 'image' ? true : false);  
	}

	function validateAddress($address) {
		$data = [
			"method" => "validateaddress",
			"params" => [$address],
		];
		$response = queryHSD($data);
		
		if (@$response["isvalid"] && @$response["isspendable"]) {
			return true;
		}

        return false;
	}

	function fetchAddress($domain) {
		$url = "http://".$domain."/.well-known/wallets/HNS";

		$c = getContents($url);
        if (validateAddress($c)) {
        	return $c;
        }

        return false;
	}

	function fetchMetaTags($url) {
		$output = [];
		
		if (filter_var($url, FILTER_VALIDATE_URL) !== false) {
			libxml_use_internal_errors(true);

			$c = getContentsWithSpoof($url);

			if ($c) {
				$d = new DomDocument();
				$d->loadHTML($c);
				$xp = new domxpath($d);

				foreach ($xp->query("//meta[@property='og:title']") as $el) {
					$output["title"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='og:title']") as $el) {
					$output["title"] = $el->getAttribute("content");
				}

				foreach ($xp->query("//meta[@property='og:description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}
				foreach ($xp->query("//meta[@name='og:description']") as $el) {
				    $output["description"] = $el->getAttribute("content");
				}

				foreach ($xp->query("//meta[@property='og:image']") as $el) {
					$image = $el->getAttribute("content");
					if (validImage($image)) {
						$output["image"] = $image;
					}
				}
				foreach ($xp->query("//meta[@name='og:image']") as $el) {
					$image = $el->getAttribute("content");
					if (validImage($image)) {
						$output["image"] = $image;
					}
				}
			}
		}

		foreach ($output as $key => $value) {
			$output[$key] = htmlentities($value);
		}

		if (@$output["title"]) {
			$id = generateCode("preview");
			$insert = sql("INSERT INTO `previews` (id, link, title, description, image) VALUES (?,?,?,?,?)", [$id, $url, @$output["title"], @$output["description"], @$output["image"]]);

			if ($insert) {
				$output["id"] = $id;
			}
		}

		return $output;
	}

	function isNameStaked($tld) {
		$data = [
			"method" => "getnameresource",
			"params" => [$tld],
		];
		$response = queryHSD($data);

		if (@$response["records"]) {
			foreach ($response["records"] as $key => $value) {
				if ($value["type"] == "NS") {
					if (stripos($value["ns"], ".nameserver.io.") !== false || stripos($value["ns"], ".registry.namebase.io.") !== false) {
						return true;
					}
				}
			}
		}

		return false;
	}

	function checkGateway($tld) {
		$url = "https://gateway.io/tlds/".$tld;
		$html = getContents($url);

		$canPurchase = preg_match("/<h1>Buy \./", $html);
		if ($canPurchase) {
			return true;
		}

		return false;
	}

	function getContentsWithCode($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        $data = curl_exec($curl);
        $code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        return [
        	"data" => $data,
        	"code" => $code
        ];
	}

	function getContents($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        $c = curl_exec($curl);
        curl_close($curl);

        return $c;
	}

	function getContentsWithSpoof($url) {
		$curl = curl_init();
        curl_setopt($curl, CURLOPT_URL, $url);
        curl_setopt($curl, CURLOPT_PROXY, "127.0.0.1:8080");
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, TRUE);
        curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 5); 
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        curl_setopt($curl, CURLOPT_USERAGENT, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)");
        $c = curl_exec($curl);
        curl_close($curl);

        return $c;
	}

	function queryHSD($data) {
		if (@$data["params"]) {
			foreach ($data["params"] as $key => $value) {
				$data["params"][$key] = trim($value);
			}
		}

		$curl = curl_init();
		curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($data));
		curl_setopt($curl, CURLOPT_HTTPHEADER, ["Content-Type:application/json"]);
		curl_setopt($curl, CURLOPT_URL,"http://x:a831d3c59ce474d8e13a7cea3a3935d3d5a55b84698abe38f2eea2329327e2c50@127.0.0.1:12037");
		curl_setopt($curl, CURLOPT_POST, 1);
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
		$response = curl_exec($curl);
		curl_close ($curl);

		if ($response) {
			$info = @json_decode($response, true);

			if (@$info["result"]) {
				return $info["result"];
			}
		}

		return false;
	}

	function queryHSW($endpoint) {
		$endpoint = trim($endpoint);

		$curl = curl_init();
		curl_setopt($curl, CURLOPT_HTTPHEADER, ["Content-Type:application/json"]);
		curl_setopt($curl, CURLOPT_URL,"http://x:a831d3c59ce474d8e13a7cea3a3935d3d5a55b84698abe38f2eea2329327e2c50@127.0.0.1:12039".$endpoint);
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
		$response = curl_exec($curl);
		curl_close ($curl);

		if ($response) {
			$info = @json_decode($response, true);

			if (@$info) {
				return $info;
			}
		}

		return false;
	}

	function secondsToHuman($seconds, $withSeconds=false) {
		$h = floor(($seconds % 86400) / 3600);
		$m = floor(($seconds % 3600) / 60);
		$s = (int)($seconds - ($h * 3600) - ($m * 60));

		$time = [];
		if ($h) {
			$time["h"] = $h."h";
		}
		if ($m) {
			$time["m"] = $m."m";
		}
		if ($withSeconds) {
			if ($s) {
				$time["s"] = $s."s";
			}
		}

		$string = implode(" ", $time);
		return $string;
	}

	class CssMinifer{ private $fileNames = []; function __construct($fileNames){ $this->fileNames = $fileNames; } private function fileValidator($fileName){ $fileParts = explode('.',$fileName); $fileExtension = end($fileParts); if(strtolower($fileExtension) !== "css"){ throw new Exception("Invalid file type. The extension for the file $fileName is $fileExtension."); } if(!file_exists($fileName)){ throw new Exception("The given file $fileName does not exists."); } } private function setHeaders(){ header('Content-Type: text/css'); } public function minify(){ $this->setHeaders(); $minifiedCss = ""; $fileNames = $this->fileNames; foreach ($fileNames as $fileName){ try{ $this->fileValidator($fileName); $fileContent = file_get_contents($fileName); $minifiedCss = $minifiedCss . $this->minify_css($fileContent); } catch(\Exception $e) { echo 'Message: ' .$e->getMessage(); return false; } } return $minifiedCss; } private function minify_css($input) { if(trim($input) === "") return $input; return preg_replace( array( '#("(?:[^"\\\]++|\\\.)*+"|\'(?:[^\'\\\\]++|\\\.)*+\')|\/\*(?!\!)(?>.*?\*\/)|^\s*|\s*$#s', '#("(?:[^"\\\]++|\\\.)*+"|\'(?:[^\'\\\\]++|\\\.)*+\'|\/\*(?>.*?\*\/))|\s*+;\s*+(})\s*+|\s*+([*$~^|]?+=|[{};,>~]|\s(?![0-9\.])|!important\b)\s*+|([[(:])\s++|\s++([])])|\s++(:)\s*+(?!(?>[^{}"\']++|"(?:[^"\\\]++|\\\.)*+"|\'(?:[^\'\\\\]++|\\\.)*+\')*+{)|^\s++|\s++\z|(\s)\s+#si', '#(?<=[\s:])(0)(cm|em|ex|in|mm|pc|pt|px|vh|vw|%)#si', '#:(0\s+0|0\s+0\s+0\s+0)(?=[;\}]|\!important)#i', '#(background-position):0(?=[;\}])#si', '#(?<=[\s:,\-])0+\.(\d+)#s', '#(\/\*(?>.*?\*\/))|(?<!content\:)([\'"])([a-z_][a-z0-9\-_]*?)\2(?=[\s\{\}\];,])#si', '#(\/\*(?>.*?\*\/))|(\burl\()([\'"])([^\s]+?)\3(\))#si', '#(?<=[\s:,\-]\#)([a-f0-6]+)\1([a-f0-6]+)\2([a-f0-6]+)\3#i', '#(?<=[\{;])(border|outline):none(?=[;\}\!])#', '#(\/\*(?>.*?\*\/))|(^|[\{\}])(?:[^\s\{\}]+)\{\}#s' ), array( '$1', '$1$2$3$4$5$6$7', '$1', ':0', '$1:0 0', '.$1', '$1$3', '$1$2$4$5', '$1$2$3', '$1:0', '$1$2' ), $input); } }
?>