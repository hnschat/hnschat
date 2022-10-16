function die(output) {
	console.log(output);
	process.exit();
}

function log(message) {
	console.log(message);
}

async function verify(web3, json) {
	let output = new Promise(resolve => {
		web3.eth.ens.getAddress(json.domain).then(function(address) {
			if (address.toLowerCase() == json.account.toLowerCase()) {
				let by = web3.eth.accounts.recover(json.code, json.signature);
				
				if (by.toLowerCase() === json.account.toLowerCase()) {
					resolve(true);
				}
				else {
					resolve(false);
				}
			}
		});
	});

	return await output;
}

try {
	const args = process.argv.slice(2);
	let json = JSON.parse(atob(args[1]));

	if (json.domain && json.code && json.account && json.signature) {
		const Web3 = require("web3");
		const web3 = new Web3(Web3.givenProvider || "ws://172.28.179.47:8546");

		verify(web3, json).then(response => {
			die(response);
		});
	}
}
catch {}