"use strict";

module.exports = function QueryFactory ($q, $http, firebaseCredentials, DataFactory, DataStorageFactory) {

	let natural = require('../../lib/node_modules/natural/'),
		stopWord = require('../../lib/node_modules/stopword/lib/stopword.js');

	let tokenizer = new natural.WordTokenizer();

	// Define a global variable that will hold the query tokens entered and make them 
	// accessible throughout this factory.
	let originalQueryTokens;

	// Define a global variable that will hold the parsed, counted query tokens as objects
	// and make them available throughout this factory.
	let countedQueryTokensArray;

	let query;

	// Grab the query from the text input box in the userInterface partial, tokenize it, 
	// lowercase the tokens, store the tokens in the global originalQueryTokens array, 
	// remove the stop words, sort the remaining tokens, and push them into an array to be
	// passed into the next function.
	let setQuery = (queryReceived) => {
		query = queryReceived;	
		// Parse the query data into individual tokens.
		let tokensArray = tokenizer.tokenize(query.toLowerCase());
		originalQueryTokens = tokensArray;
		// Remove all stop words from the array of tokens.
		tokensArray = stopWord.removeStopwords(tokensArray).sort();
		// Push the sorted tokensArray into an array.
		countTokens(tokensArray);
	};

	// Calculate the number of times each token appears in the query, create an object
	// for each token, and append the count. Push each object into an array.
	let countTokens = (tokensArray) => {
		countedQueryTokensArray = []; // Clear the array for new searches.
		let count = 1; // Every word appears at least once.
		for (var i = 0; i < tokensArray.length; i++){
			if (tokensArray[i] !== tokensArray[i+1] || tokensArray.length === 1) {
				let currentTokenObject = {};
				currentTokenObject.document = "query";
				currentTokenObject.word = tokensArray[i];
				currentTokenObject.count = count;
				currentTokenObject.uid = ""; //=============TO DO==============//
				currentTokenObject.timeStamp = new Date();
				countedQueryTokensArray.push(currentTokenObject);
			} else {
				count++;
			}
		}
		termFrequency(countedQueryTokensArray);
	};
	
	// Loop through the array of counted tokens and divide the number of appearances of each
	// term by the length of each document, which is set in the global originalQueryTokens
	// arry. This gives the normalized term frequency, which we then append to the object 
	// within the countedQueryTokensArray. Pass the countedQueryTokensArray to the 
	// inverseDocumentFrequency function. 
	let termFrequency = (countedQueryTokensArray) => {
		for (var i = 0; i < countedQueryTokensArray.length; i++) {
			let termFrequency = countedQueryTokensArray[i].count/originalQueryTokens.length;
			countedQueryTokensArray[i].termFrequency = termFrequency;
		}
		idfQuery(countedQueryTokensArray);
	};

	let idfQuery = (countedQueryTokensArray) => {	
		let queryPromises = [];
		// Loop through the array of tokens and append create a Promise containing each 
		// token. Wait for each Promise to resolve before proceeding.
		for (var i = 0; i < countedQueryTokensArray.length; i++) {
			let searchTerm = countedQueryTokensArray[i].word;
			queryPromises.push(grabControlData(searchTerm));
		}
		Promise.all(queryPromises).
			then((firebaseControlData) => getQueryKeys(firebaseControlData)).
			catch ((error)=> console.error(error));
	};
	
	// Get the hidden values from /values/firebaseCredentials.js that will allow us to 
	// access Firebase.
	let firebaseValues = firebaseCredentials.getfirebaseCredentials();
	// Get the control data from Firebase, ordered by token entered in the Promise function. 
	// This will allow us to pull the stored inverse document frequency for the query words. 
	// Pass the relevant query data to the getQueryKeys function via the Promise.all in the
	// idfQuery function.
	let path;
	let grabControlData = (searchTerm) => {
		if (DataFactory.getData()[0].document === "Test") {
			path = "-Kfg4Sm4K4PPnCsXoN-b";
		} else {
			path = "-Kfg0NSkaOAosOWnRUl6";
		}
		return $q((resolve, reject) => {
			$http.get(`${firebaseValues.databaseURL}${path}.json?orderBy=
				"word"&equalTo="${searchTerm}"`)
					.then(
						(ObjectFromFirebase) => {
							console.log("Here is my Firebase Object from grabControlData: ", ObjectFromFirebase);
							resolve(ObjectFromFirebase);
						})
					.catch((error) => console.error(error));
		});
	};

	// Get the keys for each query token that exists in the control data in order to access 
	// the token's idf value. Terms that appear multiple times have multiple keys. Separate 
	// the first key in each array to use for assigning the idf value.
	let getQueryKeys = (firebaseControlData) => {
		console.log("firebaseControlData at getQueryKeys", firebaseControlData);
		DataStorageFactory.setFirebaseData(firebaseControlData);
		let controlIdfKeys = [];
		let individualIdfKeys = [];
		for (var i = 0; i < firebaseControlData.length; i++) {
			let keys = Object.keys(firebaseControlData[i].data);
			controlIdfKeys.push(keys);
		}
		for (i = 0; i < controlIdfKeys.length; i++) {
			if (controlIdfKeys[i] === undefined) {
				individualIdfKeys.push(controlIdfKeys[i]);
			} else {
				individualIdfKeys.push(controlIdfKeys[i][0]);
			}
		}
		assignIdfValues(individualIdfKeys, firebaseControlData);
	};

	// Assign each token the idf values from the control set. If the query token does not 
	// exist in the control set, create an object for it from the countedQueryTokens array.
	// Push the amended objects into the queryArray. Pass that array to the 
	// mergeQueryCountedIdf function.
	let assignIdfValues = (individualIdfKeys, firebaseControlData) => {
		let queryArray = [];
		let controlArray = [];
		for (var i = 0; i < individualIdfKeys.length; i++) {
			let	queryObject = countedQueryTokensArray[i];
			let controlObject = firebaseControlData[i].data[individualIdfKeys[i]];
			if (controlObject === undefined) {
				queryObject.inverseDocumentFrequency = 1 + Math.log10(6/1); // TODO: Amend with dynamic data from control set.
			} else {
				queryObject.inverseDocumentFrequency = controlObject.inverseDocumentFrequency;
			}
			queryArray.push(queryObject);
		}
	setTfIdf(queryArray);
	};

	let setTfIdf = (queryArray) => {
		for (var i = 0; i < queryArray.length; i++) {
			queryArray[i].tfIdf = queryArray[i].termFrequency * 
				queryArray[i].inverseDocumentFrequency;
			DataStorageFactory.setData(queryArray);
			setData(queryArray);
		}
	};

	let finalArray = [];
	let setData = (completedArray) => {
		finalArray = completedArray;
	};

	// Create a function to make dataToOutput available to controllers.
	let getData = () => {
		console.log("finalArray at getData in the query factory: ", finalArray);
		return finalArray;
	};


	return {setQuery, grabControlData, getData};
};