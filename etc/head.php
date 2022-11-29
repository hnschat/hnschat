<meta charset="utf-8">
<meta name="google" content="notranslate"> 
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
<meta name="format-detection" content="telephone=no">
<title>Chat</title>
<link rel="manifest" href="/manifest.json"> 
<link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
<meta name="theme-color" content="#232323">
<link href="https://fonts.googleapis.com/css2?family=Rubik&display=swap" rel="stylesheet">
<?php
	if (@$isBeta) { ?>
		<link rel="stylesheet" type="text/css" href="/assets/css/style.css?r=<?php echo $revision; ?>">
		<script type="text/javascript" src="/assets/js/jquery.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/anchorme.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/date.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/e2ee.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/mask.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/punycode.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/qr.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/emojis.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/niami.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/script.js?r=<?php echo $revision; ?>"></script>
	<?php
	}
	else { ?>
		<link rel="stylesheet" type="text/css" href="/assets/css/style.min.css?r=<?php echo $revision; ?>">
		<script type="text/javascript" src="/assets/js/resources.min.js?r=<?php echo $revision; ?>"></script>
		<script type="text/javascript" src="/assets/js/script.min.js?r=<?php echo $revision; ?>"></script>
	<?php
	}
?>