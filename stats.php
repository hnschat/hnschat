<?php
	ini_set('memory_limit', '-1');
	
	include "etc/includes.php";
?>
<!DOCTYPE html>
<html>
<head>
	<?php include "etc/head.php"; ?>
</head>
<body data-page="stats">
	<div class="form" id="stats">
		<a href="/">
			<div class="logo">
				<img draggable="false" src="/assets/img/handshake">
				<span>Chat</span>
			</div>
		</a>
		<div class="section shown" id="stats">
			<div class="stat">
				<div>Total Sessions</div>
				<div><?php echo getStats("sessions"); ?></div>
			</div>
			<div class="stat">
				<div>Total Names</div>
				<div><?php echo getStats("totalNames"); ?></div>
			</div>
			<div class="stat">
				<div>Verified TLD's</div>
				<div><?php echo getStats("verifiedNames"); ?></div>
			</div>
			<div class="stat">
				<div>Unverified TLD's</div>
				<div><?php echo getStats("unverifiedNames"); ?></div>
			</div>
			<div class="stat">
				<div>Deleted TLD's</div>
				<div><?php echo getStats("deletedNames"); ?></div>
			</div>
			<div class="stat">
				<div>Unique Active Users</div>
				<div><?php echo getStats("unique"); ?></div>
			</div>
			<div class="stat">
				<div>TLD's Staked</div>
				<div><?php echo count($specialDomains); ?></div>
			</div>
			<div class="stat">
				<div>SLD's Created</div>
				<div><?php echo getStats("sld"); ?></div>
			</div>
			<div class="stat">
				<div>Channels</div>
				<div><?php echo getStats("channels"); ?></div>
			</div>
			<div class="stat">
				<div>Conversations</div>
				<div><?php echo getStats("conversations"); ?></div>
			</div>
			<div class="stat">
				<div>Messages</div>
				<div><?php echo getStats("messages"); ?></div>
			</div>
			<?php
				$top10 = top10();
				?>
				<div class="stat">
					<div>Most Active Users</div>
					<div class="list">
						<?php
							foreach ($top10 as $key => $value) { ?>
								<span><?php echo idn_to_utf8($value); ?></span>
							<?php
							}
						?>
					</div>
				</div>
				<?php
			?>
		</div>
	</div>
</body>
</html>