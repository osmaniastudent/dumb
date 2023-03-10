(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var SonicSocket = require('../lib/sonic-socket.js');
var SonicServer = require('../lib/sonic-server.js');
var SonicCoder = require('../lib/sonic-coder.js');
var PairClient = require('./pair-client.js');

var ALPHABET = '0123456789';
var TOKEN_LENGTH = 5;

// Create an ultranet server.
var sonicServer = new SonicServer({alphabet: ALPHABET, debug: false});
// Create an ultranet socket.
var sonicSocket = new SonicSocket({alphabet: ALPHABET});
// Create a connection to the pairing server.
var pairClient = new PairClient();

var token;

// UI Parts
var changeNameButton = document.querySelector('#change-name');
var connectButton = document.querySelector('#connect');
var chatForm = document.querySelector('#say');
var chatBox = chatForm.querySelector('input');
var userName = localStorage.userName || null;
var history = document.querySelector('#history');
var wrap = document.querySelector('#history-wrap');

function init() {
  // Start the pairing thing.
  initPair();
}

function initPair() {
  // Generate a random pairing token.
  token = generateToken();
  if (pairClient.isServerError) {
    onServerError();
  }
  // Setup a connection to the pairing server when it's ready.
  pairClient.on('ready', function() {
    pairClient.start(token);
  });
  // Listen for messages from other clients.
  pairClient.on('message', onIncomingChat);
  pairClient.on('connected', onConnected);
  pairClient.on('disconnected', onDisconnected);
  pairClient.on('pair-confirm', onPairReady);

  // Start an ultranet server.
  sonicServer.start();
  // Start listening for messages on the sonic server.
  sonicServer.on('message', onToken);
}

function initUI() {
  connectButton.addEventListener('click', startChatHandler);
  chatForm.addEventListener('submit', submitHandler);
  changeNameButton.addEventListener('click', changeNameHandler);

  function startChatHandler() {
    // Send the pairing token to nearby ultranet clients.
    sonicSocket.send(token);
  }

  function changeNameHandler() {
    var oldName = getUserName();
    var newName = prompt('New user name (was ' + oldName + ')');
    if (newName) {
      localStorage.userName = newName;
    }
  }

  function submitHandler(e) {
    // Broadcast the message out to the other client (if one exists).
    var authorMessage = getAuthorMessage(getUserName(), chatBox.value)
    // Send through socket.
    pairClient.send(authorMessage);
    // Clear form.
    chatBox.value = '';
    // Update the chat box.
    addChatLine(authorMessage);
    // Prevent the page from reloading.
    e.preventDefault();
  }

}

function generateToken() {
  var token = '';
  var count = 0;
  var char;
  var lastChar;
  while (count < TOKEN_LENGTH) {
    // Generate a random value from the alphabet.
    var index = Math.floor(Math.random() * ALPHABET.length);
    char = ALPHABET[index];
    if (char != lastChar) {
      count += 1;
      token += char;
      lastChar = char;
    }
  }
  return token;
}

function onToken(otherToken) {
  console.log('Got token', otherToken);
  // Don't connect to yourself!
  if (token != otherToken) {
    // Attempt to confirm the connection with the pair server.
    pairClient.confirm(otherToken);
  }
}

function onIncomingChat(text) {
  addChatLine(text);
}

function onPairReady() {
  // Change the text to be "Connect!".
  connectButton.querySelector('span').innerHTML = 'Connect!';
  // Change the button styling to be enabled.
  connectButton.classList.remove('disabled');
  // Configure UI.
  initUI();
}

function onConnected() {
  // Hide the overlay.
  document.querySelector('#overlay').style.display = 'none';
  // Place cursor inside input box.
  chatBox.focus();
}

function onDisconnected() {
  // Show the overlay.
  document.querySelector('#overlay').style.display = 'block';
}

function onServerError() {
  // Update the error dialog.
  connectButton.querySelector('span').innerHTML = 'Server error!';
}

function getAuthorMessage(author, message) {
  return author + ': ' + message;
}

function addChatLine(text) {
  var formattedText = getTime() + ' ' + text;
  history.innerHTML += formattedText + '<br/>';

  // Scroll history to the bottom.
  wrap.scrollTop = history.scrollHeight;
}

function getTime() {
  var now = new Date();
  var hours = now.getHours();
  hours = (hours > 9 ? hours: ' ' + hours);
  var mins = now.getMinutes();
  mins = (mins > 9 ? mins : '0' + mins);
  var secs = now.getSeconds();
  secs = (secs > 9 ? secs : '0' + secs);
  return '[' + hours + ':' + mins + ':' + secs + ']';
}

function getUserName() {
  return (localStorage.userName === undefined ?
          'Anonymous' : localStorage.userName);
}

window.addEventListener('load', init);

},{"../lib/sonic-coder.js":4,"../lib/sonic-server.js":5,"../lib/sonic-socket.js":6,"./pair-client.js":2}],2:[function(require,module,exports){
function PairClient() {
  this.conn_id = null;
  // Create a websocket connection to the server.
  // NOTE(smus): I am no longer running the borismus-pair-ws nodejitsu
  // instance, so to run this demo, you will need to clone the repository
  // and run your own server locally.
  this.socket = new WebSocket('ws://localhost:8080');
  //this.socket = new WebSocket('ws://borismus-pair-ws.nodejitsu.com:80');
  this.socket.onmessage = this.onMessage_.bind(this);
  this.socket.onerror = this.onError_.bind(this);

  // All callbacks.
  this.callbacks = {};
}

PairClient.prototype.start = function(token) {
  var msg = JSON.stringify({type: 'start', token: token});
  this.socket.send(msg);
};

PairClient.prototype.confirm = function(token) {
  var msg = JSON.stringify({type: 'confirm', token: token});
  this.socket.send(msg);
};

PairClient.prototype.send = function(message) {
  if (this.conn_id === null) {
    console.error('No connection ID.');
    return;
  }
  var msg = JSON.stringify(
      {type: 'message', conn_id: this.conn_id, message: message});
  this.socket.send(msg);
};

PairClient.prototype.on = function(event, callback) {
  if (event == 'ready') {
    this.socket.onopen = callback;
  }
  if (event == 'message') {
    this.callbacks.message = callback;
  }
  if (event == 'connected') {
    this.callbacks.connected = callback;
  }
  if (event == 'disconnected') {
    this.callbacks.disconnected = callback;
  }
  if (event == 'pair-confirm') {
    this.callbacks.pairConfirm = callback;
  }
};

/***** Private *******/
PairClient.prototype.onMessage_ = function(e) {
  try {
    var json = JSON.parse(e.data);
  } catch (err) {
    console.error('Message must be in JSON format.', err, e.data);
    return;
  }
  if (json.type == 'connected') {
    this.conn_id = json.conn_id;
    console.log('Connection #' + this.conn_id + ' opened.');
    this.fire_(this.callbacks.connected);
  }
  if (json.type == 'message') {
    console.log('Received: ' + json.message);
    this.fire_(this.callbacks.message, json.message);
  }
  if (json.type == 'disconnected') {
    this.conn_id = null;
    this.fire_(this.callbacks.disconnected);
  }
  if (json.type == 'pair-confirm') {
    this.fire_(this.callbacks.pairConfirm);
  }
  if (json.info) {
    console.log('Info: ' + json.info);
    // TODO(smus): Get rid of this bit and replace it with pair-confirm event
    // from server.
    if (json.info == 'Got a pair request.') {
      this.fire_(this.callbacks.pairConfirm);
    }
  }
  if (json.error) {
    console.error('Error: ' + json.error);
  }
};

PairClient.prototype.fire_ = function(callback, arg) {
  if (callback) {
    callback(arg);
  }
};

PairClient.prototype.onError_ = function(err) {
  console.error(err);
  this.isServerError = true;
};

module.exports = PairClient;

},{}],3:[function(require,module,exports){
function RingBuffer(maxLength) {
  this.array = [];
  this.maxLength = maxLength;
}

RingBuffer.prototype.get = function(index) {
  if (index >= this.array.length) {
    return null;
  }
  return this.array[index];
};

RingBuffer.prototype.last = function() {
  if (this.array.length == 0) {
    return null;
  }
  return this.array[this.array.length - 1];
}

RingBuffer.prototype.add = function(value) {
  // Append to the end, remove from the front.
  this.array.push(value);
  if (this.array.length >= this.maxLength) {
    this.array.splice(0, 1);
  }
};

RingBuffer.prototype.length = function() {
  // Return the actual size of the array.
  return this.array.length;
};

RingBuffer.prototype.clear = function() {
  this.array = [];
};

RingBuffer.prototype.copy = function() {
  // Returns a copy of the ring buffer.
  var out = new RingBuffer(this.maxLength);
  out.array = this.array.slice(0);
  return out;
};

RingBuffer.prototype.remove = function(index, length) {
  //console.log('Removing', index, 'through', index+length);
  this.array.splice(index, length);
};

module.exports = RingBuffer;

},{}],4:[function(require,module,exports){
/**
 * A simple sonic encoder/decoder for [a-z0-9] => frequency (and back).
 * A way of representing characters with frequency.
 */
var ALPHABET = '\n abcdefghijklmnopqrstuvwxyz0123456789,.!?@*';

function SonicCoder(params) {
  params = params || {};
  this.freqMin = params.freqMin || 18500;
  this.freqMax = params.freqMax || 19500;
  this.freqError = params.freqError || 50;
  this.alphabetString = params.alphabet || ALPHABET;
  this.startChar = params.startChar || '^';
  this.endChar = params.endChar || '$';
  // Make sure that the alphabet has the start and end chars.
  this.alphabet = this.startChar + this.alphabetString + this.endChar;
}

/**
 * Given a character, convert to the corresponding frequency.
 */
SonicCoder.prototype.charToFreq = function(char) {
  // Get the index of the character.
  var index = this.alphabet.indexOf(char);
  if (index == -1) {
    // If this character isn't in the alphabet, error out.
    console.error(char, 'is an invalid character.');
    index = this.alphabet.length - 1;
  }
  // Convert from index to frequency.
  var freqRange = this.freqMax - this.freqMin;
  var percent = index / this.alphabet.length;
  var freqOffset = Math.round(freqRange * percent);
  return this.freqMin + freqOffset;
};

/**
 * Given a frequency, convert to the corresponding character.
 */
SonicCoder.prototype.freqToChar = function(freq) {
  // If the frequency is out of the range.
  if (!(this.freqMin < freq && freq < this.freqMax)) {
    // If it's close enough to the min, clamp it (and same for max).
    if (this.freqMin - freq < this.freqError) {
      freq = this.freqMin;
    } else if (freq - this.freqMax < this.freqError) {
      freq = this.freqMax;
    } else {
      // Otherwise, report error.
      console.error(freq, 'is out of range.');
      return null;
    }
  }
  // Convert frequency to index to char.
  var freqRange = this.freqMax - this.freqMin;
  var percent = (freq - this.freqMin) / freqRange;
  var index = Math.round(this.alphabet.length * percent);
  return this.alphabet[index];
};

module.exports = SonicCoder;

},{}],5:[function(require,module,exports){
var RingBuffer = require('./ring-buffer.js');
var SonicCoder = require('./sonic-coder.js');

var audioContext = new AudioContext || new webkitAudioContext();
/**
 * Extracts meaning from audio streams.
 *
 * (assumes audioContext is a WebAudioContext global variable.)
 *
 * 1. Listen to the microphone.
 * 2. Do an FFT on the input.
 * 3. Extract frequency peaks in the ultrasonic range.
 * 4. Keep track of frequency peak history in a ring buffer.
 * 5. Call back when a peak comes up often enough.
 */
function SonicServer(params) {
  params = params || {};
  this.peakThreshold = params.peakThreshold || -65;
  this.minRunLength = params.minRunLength || 2;
  this.coder = params.coder || new SonicCoder(params);
  // How long (in ms) to wait for the next character.
  this.timeout = params.timeout || 300;
  this.debug = !!params.debug;

  this.peakHistory = new RingBuffer(16);
  this.peakTimes = new RingBuffer(16);

  this.callbacks = {};

  this.buffer = '';
  this.state = State.IDLE;
  this.isRunning = false;
  this.iteration = 0;
}

var State = {
  IDLE: 1,
  RECV: 2
};

/**
 * Start processing the audio stream.
 */
SonicServer.prototype.start = function() {
  // Start listening for microphone. Continue init in onStream.
  var constraints = {
    audio: { optional: [{ echoCancellation: false }] }
  };
  navigator.webkitGetUserMedia(constraints,
      this.onStream_.bind(this), this.onStreamError_.bind(this));
};

/**
 * Stop processing the audio stream.
 */
SonicServer.prototype.stop = function() {
  this.isRunning = false;
  this.stream.stop();
};

SonicServer.prototype.on = function(event, callback) {
  if (event == 'message') {
    this.callbacks.message = callback;
  }
};

SonicServer.prototype.setDebug = function(value) {
  this.debug = value;

  var canvas = document.querySelector('canvas');
  if (canvas) {
    // Remove it.
    canvas.parentElement.removeChild(canvas);
  }
};

SonicServer.prototype.fire_ = function(callback, arg) {
  callback(arg);
};

SonicServer.prototype.onStream_ = function(stream) {
  this.stream = stream;
  // Setup audio graph.
  var input = audioContext.createMediaStreamSource(stream);
  var analyser = audioContext.createAnalyser();
  input.connect(analyser);
  // Create the frequency array.
  this.freqs = new Float32Array(analyser.frequencyBinCount);
  // Save the analyser for later.
  this.analyser = analyser;
  this.isRunning = true;
  // Do an FFT and check for inaudible peaks.
  this.raf_(this.loop.bind(this));
};

SonicServer.prototype.onStreamError_ = function(e) {
  console.error('Audio input error:', e);
};

/**
 * Given an FFT frequency analysis, return the peak frequency in a frequency
 * range.
 */
SonicServer.prototype.getPeakFrequency = function() {
  // Find where to start.
  var start = this.freqToIndex(this.coder.freqMin);
  // TODO: use first derivative to find the peaks, and then find the largest peak.
  // Just do a max over the set.
  var max = -Infinity;
  var index = -1;
  for (var i = start; i < this.freqs.length; i++) {
    if (this.freqs[i] > max) {
      max = this.freqs[i];
      index = i;
    }
  }
  // Only care about sufficiently tall peaks.
  if (max > this.peakThreshold) {
    return this.indexToFreq(index);
  }
  return null;
};

SonicServer.prototype.loop = function() {
  this.analyser.getFloatFrequencyData(this.freqs);
  // Sanity check the peaks every 5 seconds.
  if ((this.iteration + 1) % (60 * 5) == 0) {
    this.restartServerIfSanityCheckFails();
  }
  // Calculate peaks, and add them to history.
  var freq = this.getPeakFrequency();
  if (freq) {
    var char = this.coder.freqToChar(freq);
    // DEBUG ONLY: Output the transcribed char.
    if (this.debug) {
      console.log('Transcribed char: ' + char);
    }
    this.peakHistory.add(char);
    this.peakTimes.add(new Date());
  } else {
    // If no character was detected, see if we've timed out.
    var lastPeakTime = this.peakTimes.last();
    if (lastPeakTime && new Date() - lastPeakTime > this.timeout) {
      // Last detection was over 300ms ago.
      this.state = State.IDLE;
      if (this.debug) {
        console.log('Token', this.buffer, 'timed out');
      }
      this.peakTimes.clear();
    }
  }
  // Analyse the peak history.
  this.analysePeaks();
  // DEBUG ONLY: Draw the frequency response graph.
  if (this.debug) {
    this.debugDraw_();
  }
  if (this.isRunning) {
    this.raf_(this.loop.bind(this));
  }
  this.iteration += 1;
};

SonicServer.prototype.indexToFreq = function(index) {
  var nyquist = audioContext.sampleRate/2;
  return nyquist/this.freqs.length * index;
};

SonicServer.prototype.freqToIndex = function(frequency) {
  var nyquist = audioContext.sampleRate/2;
  return Math.round(frequency/nyquist * this.freqs.length);
};

/**
 * Analyses the peak history to find true peaks (repeated over several frames).
 */
SonicServer.prototype.analysePeaks = function() {
  // Look for runs of repeated characters.
  var char = this.getLastRun();
  if (!char) {
    return;
  }
  if (this.state == State.IDLE) {
    // If idle, look for start character to go into recv mode.
    if (char == this.coder.startChar) {
      this.buffer = '';
      this.state = State.RECV;
    }
  } else if (this.state == State.RECV) {
    // If receiving, look for character changes.
    if (char != this.lastChar &&
        char != this.coder.startChar && char != this.coder.endChar) {
      this.buffer += char;
      this.lastChar = char;
    }
    // Also look for the end character to go into idle mode.
    if (char == this.coder.endChar) {
      this.state = State.IDLE;
      this.fire_(this.callbacks.message, this.buffer);
      this.buffer = '';
    }
  }
};

SonicServer.prototype.getLastRun = function() {
  var lastChar = this.peakHistory.last();
  var runLength = 0;
  // Look at the peakHistory array for patterns like ajdlfhlkjxxxxxx$.
  for (var i = this.peakHistory.length() - 2; i >= 0; i--) {
    var char = this.peakHistory.get(i);
    if (char == lastChar) {
      runLength += 1;
    } else {
      break;
    }
  }
  if (runLength > this.minRunLength) {
    // Remove it from the buffer.
    this.peakHistory.remove(i + 1, runLength + 1);
    return lastChar;
  }
  return null;
};

/**
 * DEBUG ONLY.
 */
SonicServer.prototype.debugDraw_ = function() {
  var canvas = document.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }
  canvas.width = document.body.offsetWidth;
  canvas.height = 480;
  drawContext = canvas.getContext('2d');
  // Plot the frequency data.
  for (var i = 0; i < this.freqs.length; i++) {
    var value = this.freqs[i];
    // Transform this value (in db?) into something that can be plotted.
    var height = value + 400;
    var offset = canvas.height - height - 1;
    var barWidth = canvas.width/this.freqs.length;
    drawContext.fillStyle = 'black';
    drawContext.fillRect(i * barWidth, offset, 1, 1);
  }
};

/**
 * A request animation frame shortcut. This one is intended to work even in
 * background pages of an extension.
 */
SonicServer.prototype.raf_ = function(callback) {
  var isCrx = !!(window.chrome && chrome.extension);
  if (isCrx) {
    setTimeout(callback, 1000/60);
  } else {
    requestAnimationFrame(callback);
  }
};

SonicServer.prototype.restartServerIfSanityCheckFails = function() {
  // Strange state 1: peaks gradually get quieter and quieter until they
  // stabilize around -800.
  if (this.freqs[0] < -300) {
    console.error('freqs[0] < -300. Restarting.');
    this.restart();
    return;
  }
  // Strange state 2: all of the peaks are -100. Check just the first few.
  var isValid = true;
  for (var i = 0; i < 10; i++) {
    if (this.freqs[i] == -100) {
      isValid = false;
    }
  }
  if (!isValid) {
    console.error('freqs[0:10] == -100. Restarting.');
    this.restart();
  }
}

SonicServer.prototype.restart = function() {
  //this.stop();
  //this.start();
  window.location.reload();
};


module.exports = SonicServer;

},{"./ring-buffer.js":3,"./sonic-coder.js":4}],6:[function(require,module,exports){
var SonicCoder = require('./sonic-coder.js');

var audioContext = window.audioContext || new webkitAudioContext();

/**
 * Encodes text as audio streams.
 *
 * 1. Receives a string of text.
 * 2. Creates an oscillator.
 * 3. Converts characters into frequencies.
 * 4. Transmits frequencies, waiting in between appropriately.
 */
function SonicSocket(params) {
  params = params || {};
  this.coder = params.coder || new SonicCoder();
  this.charDuration = params.charDuration || 0.2;
  this.coder = params.coder || new SonicCoder(params);
  this.rampDuration = params.rampDuration || 0.001;
}


SonicSocket.prototype.send = function(input, opt_callback) {
  // Surround the word with start and end characters.
  input = this.coder.startChar + input + this.coder.endChar;
  // Use WAAPI to schedule the frequencies.
  for (var i = 0; i < input.length; i++) {
    var char = input[i];
    var freq = this.coder.charToFreq(char);
    var time = audioContext.currentTime + this.charDuration * i;
    this.scheduleToneAt(freq, time, this.charDuration);
  }

  // If specified, callback after roughly the amount of time it would have
  // taken to transmit the token.
  if (opt_callback) {
    var totalTime = this.charDuration * input.length;
    setTimeout(opt_callback, totalTime * 1000);
  }
};

SonicSocket.prototype.scheduleToneAt = function(freq, startTime, duration) {
  var gainNode = audioContext.createGain();
  // Gain => Merger
  gainNode.gain.value = 0;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(1, startTime + this.rampDuration);
  gainNode.gain.setValueAtTime(1, startTime + duration - this.rampDuration);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

  gainNode.connect(audioContext.destination);

  var osc = audioContext.createOscillator();
  osc.frequency.value = freq;
  osc.connect(gainNode);

  osc.start(startTime);
};

module.exports = SonicSocket;

},{"./sonic-coder.js":4}]},{},[1])