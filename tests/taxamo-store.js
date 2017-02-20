var chakram = require('chakram'),
expect = chakram.expect;
var crypt = require('cryptiles');

const cg = require('./config.json'),
tokens = cg.TOKENS,
token = cg.TOKEN,
errorsSchema = require('./error_schema.json'),
transactionSchema = require('./post_schema.json');

cg.DEBUG ? chakram.startDebug() : chakram.stopDebug(); // switch logging requests/response

const transaction = function () {
	return {
		transaction: {
			transaction_lines: [
			{
				custom_id: "line1",
				amount: 200
			}
			],
			currency_code: "USD",
			billing_country_code: "BE",
			buyer_credit_card_prefix: "424242424"
		}
	};
};


describe("Taxamo API", function() {
	
	var data = transaction();
	data = Object.assign(data,token.private.data);

	describe("Test Store transaction", function () {
		var apiResponse;
		var url = cg.APP_URL + cg.STORE_TRANSACTION_API;
		before(function () {

			apiResponse = chakram.post(url, data);
			return apiResponse;
		});

		it("should return 200 on success", function () {
			expect(apiResponse).to.not.have.status(401);
			expect(apiResponse).to.have.status(200);
			return chakram.wait();
		});

		it("should respond with data matching the Store transaction schema", function () {
			
			return expect(apiResponse).to.have.schema(transactionSchema);
		});

		it("should store given amount", function () {
			var expected = data.transaction.transaction_lines[0].amount;
			return expect(apiResponse).to.have.json('transaction', function (transaction) {
				var amount = transaction.transaction_lines[0].amount;
				expect(amount).to.be.equal(expected);
			});
		});
		
		it("should always return tax_amount", function () {
			return expect(apiResponse).to.have.json('transaction', function (transaction) {
				var tax_amount = transaction.tax_amount;
				expect(tax_amount).to.be.not.null;
				expect(tax_amount >= 0).to.be.true;
			});

		});

		it("should create new transaction with status \"N\"", function () {
			return expect(apiResponse).to.have.json('transaction.status','N');
		});

		it("should create uniqe key for each transaction", function () {
			var newApiResponse;
			newApiResponse = chakram.post(url, data);
			expect(newApiResponse).to.have.status(200);
			return chakram.all([apiResponse,newApiResponse]).then(function(responses) {
				expect(responses[0].body.transaction.key).to.not.be.equal(responses[1].body.transaction.key);
				return chakram.wait();
			});
		});

		it("should caclulate total_amount", function () {
			return expect(apiResponse).to.have.json('transaction', function (transaction) {
				var tax_amount = transaction.tax_amount;
				var amount = transaction.amount;
				var total_amount = transaction.total_amount;
				expect(tax_amount + amount).to.be.equal(total_amount);
				expect(total_amount >= 0).to.be.true;
			});
		});

		it("should support multiple transaction_lines (orders)", function () {
			var multipleResponse,
			multipleLines = {};
			multipleLines = Object.assign({}, data);
			newLine = {
				custom_id: "line2",
				amount: 10
			};
			multipleLines.transaction.transaction_lines.push(newLine);
			return chakram.post(url, multipleLines)
			.then(function(response) {
				expect(response.body.transaction.transaction_lines.length).to.be.equal(2);
				
			});
		});

		it("should response with error on same transaction line ID", function () {
			var newData = Object.assign({}, data);
			newData.transaction.transaction_lines.push(newData.transaction.transaction_lines[0])
			var newApiResponse = chakram.post(url, newData);
			expect(newApiResponse).to.have.schema(errorsSchema);
			expect(newApiResponse).to.have.status(400);
			expect(newApiResponse).to.have.json('errors[0]',"Please provide unique line custom ids.");
			return chakram.wait();
		});

		it("should not create empty transaction", function () {
			return chakram.post(url,token.private.data).then(function (response) {
				expect(response).to.have.status(400);
				expect(response).to.have.schema(errorsSchema);
				return chakram.wait();
			});
		});

		var Authentication = function (token) {
			it("should support Authentication with " + token.name + " in headers", function () {
				var newData = transaction();

				return chakram.post(url,newData,{headers: token.header}).then(function (response) {
					expect(response).to.have.status(200);
					expect(response).to.have.schema(transactionSchema);
					expect(response.body).to.not.have.schema(errorsSchema);
					return chakram.wait();
				});
			});

			it("should support Authentication with " + token.name + " in body", function () {
				var newData = transaction();
				newData = Object.assign(newData,token.data);
				return chakram.post(url,newData).then(function (response) {
					expect(response).to.have.status(200);
					expect(response).to.have.schema(transactionSchema);
					expect(response.body).to.not.have.schema(errorsSchema);
					return chakram.wait();
				});
			});
			it("should support Authentication with " + token.name + " in query", function () {
				var newData = transaction();

				return chakram.post(url + '?' + token.query,newData).then(function (response) {
					expect(response).to.have.status(200);
					expect(response).to.have.schema(transactionSchema);
					expect(response.body).to.not.have.schema(errorsSchema);
					return chakram.wait();
				});
			});
		};
		Authentication(token.private);
		Authentication(token.public);

		it("should require token", function () {
			var newData = transaction();

			return chakram.post(url,newData).then(function (response) {
				expect(response).to.have.status(401);
				expect(response).to.have.schema(errorsSchema);
				expect(response).to.have.json('errors[0]','Please provide correct public token.');
				return chakram.wait();
			});
		});

		var AuthError = function (token) {
			it("should not accept invalid " + token.name, function () {
					var newData = transaction();
		
					return chakram.post(url + '?' + token.query + '2',newData).then(function (response) {
						expect(response).to.have.status(401);
						expect(response).to.have.schema(errorsSchema);
						expect(response).to.have.json('errors[0]','Please provide correct {token}.'.replace('{token}', token.name));
						return chakram.wait();
					});
				});
		};
		AuthError(token.private);
		AuthError(token.public);
	});


	describe("Test Retrieve transaction by key", function() {
		var apiResponse;
		var url = cg.APP_URL + cg.RETRIEVE_TRANSACTION_API;
		var data = transaction();
		data = Object.assign(data,token.private.data);

		before(function () {
			apiResponse = chakram.post(cg.APP_URL + cg.STORE_TRANSACTION_API, data);
			return chakram.wait();
		});
		var header = {
			headers: token.private.header
		};
		it("should find transaction by given key", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var retrievedResponse = chakram.get(url.replace('{key}',transactionJson.key),header);
				return expect(retrievedResponse).to.have.json('transaction', function (retrievedResponseJson) {
					expect(transactionJson.amount).to.be.equal(retrievedResponseJson.amount);
					expect(transactionJson.buyer_credit_card_prefix).to.be.equal(retrievedResponseJson.buyer_credit_card_prefix);
					expect(transactionJson.key).to.be.equal(retrievedResponseJson.key);
					expect(transactionJson.create_timestamp).to.be.equal(retrievedResponseJson.create_timestamp);
					expect(transactionJson.order_date).to.be.equal(retrievedResponseJson.order_date);
					expect(transactionJson.status).to.be.equal(retrievedResponseJson.status);
					expect(transactionJson.transaction_lines.length).to.be.equal(retrievedResponseJson.transaction_lines.length);
					return chakram.wait();
				});
			});
			return chakram.wait();
		});
		it("should response with error 404 if key is not found", function () {
			var badKeyResponse = chakram.get(url.replace('{key}',crypt.randomString(28)),header);
			expect(badKeyResponse).to.have.status(404);
			expect(badKeyResponse).to.have.json('errors[0]',"Resource Not Found");
			return chakram.wait();
		});
	});

	describe("Test delete transaction", function () {
		var apiResponse;
		var urlPost = cg.APP_URL + cg.STORE_TRANSACTION_API;
		var urlGet = cg.APP_URL + cg.RETRIEVE_TRANSACTION_API;
		var data = transaction();

		data = Object.assign(data,token.private.data);
		var header = {
			headers: token.private.header
		};
		before(function () {
			apiResponse = chakram.post(urlPost, data);
			return apiResponse;
		});

		it("should delete transaction", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var deleteResponse = chakram.delete(cg.APP_URL + cg.DELETE_TRANSACTION_API.replace('{key}',transactionJson.key),{},header);
				expect(deleteResponse).to.have.status(200);
				expect(deleteResponse).to.have.json({"success": true});
				return chakram.wait();
			});
			return chakram.wait();
		});

		it("should return error if transaction not found", function () {
			return expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				chakram.delete(cg.APP_URL + cg.DELETE_TRANSACTION_API.replace('{key}',transactionJson.key),{},header).then(function (response) {
					expect(response).to.have.status(404);
					expect(response).to.have.json('errors[0]',"Resource Not Found");
					return chakram.wait()
				});

				chakram.get(urlGet.replace('{key}',transactionJson.key),header).then(function (response) {
					expect(checkDeletedResponse).to.have.status(404);
					expect(checkDeletedResponse).to.have.json('errors[0]',"Resource Not Found");
					return chakram.wait()
				});
			});
			
		});
	});

	describe("Test Update transaction", function () {
		var apiResponse;
		var urlPut = cg.APP_URL + cg.UPDATE_TRANSACTION_API;
		var urlPost = cg.APP_URL + cg.STORE_TRANSACTION_API;
		var data = transaction();
		data = Object.assign(data,token.private.data);
		
		before(function () {

			apiResponse = chakram.post(urlPost, data);
			return apiResponse;
		});
		it("should update transaction", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var newData = {
					transaction: {
						buyer_ip: '255.255.255.255',
						transaction_lines: [
						{
							amount: 350,
							custom_id: "line1"
						}
						]
					},
					private_token: tokens.private
				};
				var updatedResponse = chakram.put(urlPut.replace('{key}',transactionJson.key),newData);
				expect(updatedResponse).to.have.status(200);
				expect(updatedResponse).to.have.json('transaction', function(transaction){
					expect(transaction.amount).to.not.be.equal(transactionJson.amount);
					expect(transaction.buyer_credit_card_prefix).to.be.equal(transactionJson.buyer_credit_card_prefix);
					expect(transaction.key).to.be.equal(transactionJson.key);
					expect(transaction.create_timestamp).to.be.equal(transactionJson.create_timestamp);
					expect(transaction.order_date).to.be.equal(transactionJson.order_date);
					expect(transaction.status).to.be.equal(transactionJson.status);
					expect(transaction.buyer_ip).to.not.be.equal(transactionJson.buyer_ip);
					expect(transaction.amount).to.be.equal(newData.transaction.transaction_lines[0].amount);
					expect(transaction.buyer_ip).to.be.equal(newData.transaction.buyer_ip);
				});
				return chakram.wait();
			});
			return chakram.wait();
		});
		it("should not allow to update restricted fields", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var newData = {
					transaction: {
						tax_amount: 200
					},
					private_token: tokens.private
				};
				var updatedResponse = chakram.put(urlPut.replace('{key}',transactionJson.key),newData);
				expect(updatedResponse).to.have.schema(errorsSchema);
				expect(updatedResponse).to.have.status(400);
				expect(updatedResponse).to.comprise.of.json('errors[0]','Validation failed: ');
				return chakram.wait();
			});
			return chakram.wait();
		});

		it("should not update status field", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var newData = {
					transaction: {
						status: "C"
					},
					private_token: tokens.private
				};
				var updatedResponse = chakram.put(urlPut.replace('{key}',transactionJson.key),newData);
				expect(updatedResponse).to.have.status(200);
				expect(updatedResponse).to.have.json('transaction', function(transaction){
					expect(transaction.status).to.be.equal(transactionJson.status);
					expect(transaction.status).to.not.be.equal("C");
				});
				return chakram.wait();
			});
			return chakram.wait();
		});
	});

	describe("Test Confirm and Unconfirm transaction", function () {
		var apiResponse;
		var urlConfirm = cg.APP_URL + cg.CONFIRM_TRANSACTION_API;
		var urlUnconfirm = cg.APP_URL + cg.UNCONFIRM_TRANSACTION_API;
		var data = transaction();
		data = Object.assign(data,token.private.data);
		var header = {
			headers: token.private.header
		};
		before(function () {
			apiResponse = chakram.post(cg.APP_URL + cg.STORE_TRANSACTION_API, data);
			return chakram.wait();
		});

		it("should update status \'C\' field on Confirm request", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var updatedResponse = chakram.post(urlConfirm.replace('{key}',transactionJson.key),{},header);
				expect(updatedResponse).to.have.status(200);
				expect(updatedResponse).to.have.json('transaction', function(transaction){
					expect(transaction.status).to.not.be.equal(transactionJson.status);
					expect(transaction.status).to.be.equal("C");
				});
				return chakram.wait();
			});
			return chakram.wait();
		});
		
		it("should not confirm transaction if it is not in state \"N\" ", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var updatedResponse = chakram.post(urlConfirm.replace('{key}',transactionJson.key),{},header);
				expect(updatedResponse).to.have.schema(errorsSchema);
				expect(updatedResponse).to.have.status(400);
				expect(updatedResponse).to.have.json('errors[0]', "Transaction cannot be confirmed, as it is not in 'N' state.");
				return chakram.wait();
			});
			return chakram.wait();
		});
		it("should unconfirm transaction in state \"C\" ", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var updatedResponse = chakram.post(urlUnconfirm.replace('{key}',transactionJson.key),{},header);
				expect(updatedResponse).to.have.status(200);
				expect(updatedResponse).to.have.json('transaction.status', 'N');
				return chakram.wait();
			});
			return chakram.wait();
		});
		it("should not unconfirm transaction if it is not in state \"C\" ", function () {
			expect(apiResponse).to.have.json('transaction', function (transactionJson) {
				var updatedResponse = chakram.post(urlUnconfirm.replace('{key}',transactionJson.key),{},header);
				expect(updatedResponse).to.have.schema(errorsSchema);
				expect(updatedResponse).to.have.status(400);
				expect(updatedResponse).to.have.json('errors[0]', "Transaction cannot be unconfirmed, as it is not in 'C' state.");
				return chakram.wait();
			});
			return chakram.wait();
		});
	});

	describe("Test Browse transactions", function () {
		var order_date = "2017-01-01"
		var url = cg.APP_URL + cg.BROWSE_TRANSACTION_API
		it("should return 100 transactions by default", function () {
			this.timeout(2000);
			return chakram.get(url + "?" + token.private.query).then(function (response) {
				return expect(response).to.have.json('transactions', function (transactions) {
					return expect(transactions.length).to.be.equal(100);
				});
			});
		});

		it("should return max 1000 transactions", function () {
			this.timeout(10000);
			return chakram.get(url + "?" + token.private.query + "&limit=2000").then(function (response) {
				return expect(response).to.have.json('transactions', function (transactions) {
					return expect(transactions.length).to.be.equal(1000);
				});
			});
		});

		it("should raise Validation error on field type mismatch", function () {
			return chakram.get(url + "?" + token.private.query + "&limit=i").then(function (response) {
				expect(response).to.have.schema(errorsSchema);
				expect(response).to.have.status(400);
				return chakram.wait();
			});
		});

		it("should support order_date_from parameter", function () {
			this.timeout(10000);
			var apiResponse = chakram.get(url + "?" + token.private.query + "&order_date_from=" + order_date + "&limit=5");
			return expect(apiResponse).to.have.json('transactions', function(transactions) {
				while (transactions.length > 0) {
					var transaction = transactions.pop();
					var transactionOrderDate = new Date (transaction.order_date);
					var expectedOrderDate = new Date(order_date)
					
					expect(transactionOrderDate > expectedOrderDate).to.be.true;
				}
			});
		});
		it("should support order_date_to parameter", function () {
			this.timeout(10000);
			
			var apiResponse = chakram.get(url + "?" + token.private.query + "&order_date_to=" + order_date + "&limit=5");
			return expect(apiResponse).to.have.json('transactions', function(transactions) {
				while (transactions.length > 0) {
					var transaction = transactions.pop();
					var transactionOrderDate = new Date (transaction.order_date);
					var expectedOrderDate = new Date(order_date)
					
					expect(transactionOrderDate < expectedOrderDate).to.be.true;
				}
			});
		});
		it("should return limited number of transactions", function () {
			var apiResponse = chakram.get(url + "?" + token.private.query + "&limit=22");
			return expect(apiResponse).to.have.json('transactions', function(transactions) {
				return expect(transactions.length === 22).to.be.true;
			});
		});

		it("should query by several arguments", function () {
			this.timeout(20000);
			var apiResponse = chakram.get(url + "?" + token.private.query + "&total_amount_greater_than=100" + "&total_amount_less_than=133" + "&limit=6" + "&statuses=C");
			return expect(apiResponse).to.have.json('transactions', function(transactions) {
				while (transactions.length > 0) {
					var transaction = transactions.pop();
					var max = 133;
					var min = 100;
					var actual = transaction.total_amount;
					expect(actual > min && actual < max).to.be.true;
					expect(transaction.status).to.be.equal('C');
				}
				return chakram.wait();
			});
		});

		it("should return empty transactions list if nothing found", function () {
			this.timeout(10000);
			var apiResponse = chakram.get(url + "?" + token.private.query + "&key_or_custom_id=vborodav");
			expect(apiResponse).to.have.status(200);
			return expect(apiResponse).to.have.json('transactions', function(transactions) {
				return expect(transactions.length === 0).to.be.true;
			});
		});

		
		it("should support format csv parameter", function () {
			var apiResponse = chakram.get(url + "?" + token.private.query + "&order_date_to=" + order_date + "&limit=5" + "&format=csv");
			var re = new RegExp('csv');
			return expect(apiResponse).to.have.header('content-type', re);
		});

		it("should support offset parameter", function () {
			var responses = [];
			responses.push(chakram.get(url + '?limit=5&offset=1' + '&' + token.private.query));
			responses.push(chakram.get(url + '?limit=5&offset=2' + '&' + token.private.query));
			return chakram.all(responses).then(function (responses){
				var set1=[],
				set2=[];
				for (var i = responses[0].length; i > 0; i++) {
					set1.push(responses[0].body.transactions[i].key);
					set2.push(responses[1].body.transactions[i].key);
				}
				
				for (var i = 0; i < set1.length; i++) {
					expect(set1.indexOf(set2[i])).to.be.equal(-1);
				}
				return chakram.wait();
			});
		});
	});
});