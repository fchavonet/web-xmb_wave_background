/*********************
* RESPONSIVE WARNING *
*********************/

const responsiveWarning = document.getElementById("responsive-warning");
// "true" if the site is optimized for responsive design, "false" if not.
const responsiveDesign = true;

// Show mobile warning if the user is on mobile and responsive-design is false.
if (!responsiveDesign && window.innerWidth <= 768) {
	responsiveWarning.classList.add("show");
}


/*******************************
* XMB WAVE BACKGROUND BEHAVIOR *
*******************************/

const body = document.body;

// Get canvas element and WebGL context.
const canvas = document.getElementById("webgl-canvas");
const context = canvas.getContext("webgl");

if (!context) {
	console.error("WebGL not supported");
}

let shaderProgram;
let timeUniformLocation;
let resolutionUniformLocation;
let lightModeUniformLocation;

// Resize canvas to match window.
function resizeCanvas() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	context.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Vertex shader (passthrough).
const vertexShaderSource = `
attribute vec2 aVertexPosition;
void main() {
    gl_Position = vec4(aVertexPosition, 0.0, 1.0);
}
`;

// Fragment shader (wave effect + light/dark mode).
const fragmentShaderSource = `
precision highp float;

// Elapsed time in seconds.
uniform float uTime;
// Viewport resolution.
uniform vec2  uResolution;
// Toggle light/dark.
uniform bool  uLightMode;

const float waveWidthFactor = 1.5;

vec3 calcSine(
	vec2 uv,
	float speed,
	float frequency,
	float amplitude,
	float phaseShift,
	float verticalOffset,
	vec3 baseColor,
	float lineWidth,
	float sharpness,
	bool invertFalloff
) {

	// Compute wave position.
	float angle = uTime * speed * frequency * -1.0 + (phaseShift + uv.x) * 2.0;
	float waveY = sin(angle) * amplitude + verticalOffset;
	float deltaY = waveY - uv.y;
	float distanceVal  = distance(waveY , uv.y);

	// Amplify falloff on one side.
	if (invertFalloff) {
		if (deltaY > 0.0) {
			distanceVal = distanceVal * 4.0;
		}
	} else {
		if (deltaY < 0.0) {
			distanceVal = distanceVal * 4.0;
		}
	}

	float smoothVal = smoothstep(lineWidth * waveWidthFactor, 0.0, distanceVal);
	float scaleVal  = pow(smoothVal, sharpness);

	return min(baseColor * scaleVal, baseColor);
}

void main() {
	// Normalize fragment coords.
	vec2 uv = gl_FragCoord.xy / uResolution;

	// Accumulate wave colors.
	vec3 accumulatedColor = vec3(0.0);
	accumulatedColor += calcSine(uv, 0.2, 0.20, 0.2, 0.0, 0.5, vec3(0.3), 0.1, 15.0, false);
	accumulatedColor += calcSine(uv, 0.4, 0.40, 0.15, 0.0, 0.5, vec3(0.3), 0.1, 17.0, false);
	accumulatedColor += calcSine(uv, 0.3, 0.60, 0.15, 0.0, 0.5, vec3(0.3), 0.05, 23.0, false);
	accumulatedColor += calcSine(uv, 0.1, 0.26, 0.07, 0.0, 0.3, vec3(0.3), 0.1, 17.0, true);
	accumulatedColor += calcSine(uv, 0.3, 0.36, 0.07, 0.0, 0.3, vec3(0.3), 0.1, 17.0, true);
	accumulatedColor += calcSine(uv, 0.5, 0.46, 0.07, 0.0, 0.3, vec3(0.3), 0.05, 23.0, true);
	accumulatedColor += calcSine(uv, 0.2, 0.58, 0.05, 0.0, 0.3, vec3(0.3), 0.2, 15.0, true);

	// Determine mask from max channel.
	float maxChannel = accumulatedColor.r;

	if (accumulatedColor.g > maxChannel) {
		maxChannel = accumulatedColor.g;
	}

	if (accumulatedColor.b > maxChannel) {
		maxChannel = accumulatedColor.b;
	}

	// Discard if no wave.
	if (maxChannel <= 0.0) {
		discard;
	}

	// Apply light mode inversion.
	vec3 outputColor = accumulatedColor;

	if (uLightMode) {
		outputColor = vec3(1.0) - clamp(accumulatedColor, 0.0, 1.0);
	}

	// Output final color.
	gl_FragColor = vec4(outputColor, 1.0);
}
`;

// Compile shader and log errors.
function compileShader(source, type) {
	const shader = context.createShader(type);
	context.shaderSource(shader, source);
	context.compileShader(shader);

	if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
		console.error("Shader error:", context.getShaderInfoLog(shader));
		context.deleteShader(shader);

		return null;
	}

	return shader;
}

// Setup shaders, buffers, and start render loop.
function initializeWebGL() {
	const vs = compileShader(vertexShaderSource, context.VERTEX_SHADER);
	const fs = compileShader(fragmentShaderSource, context.FRAGMENT_SHADER);

	shaderProgram = context.createProgram();
	context.attachShader(shaderProgram, vs);
	context.attachShader(shaderProgram, fs);
	context.linkProgram(shaderProgram);

	if (!context.getProgramParameter(shaderProgram, context.LINK_STATUS)) {
		console.error("Link error:", context.getProgramInfoLog(shaderProgram));
	}

	context.useProgram(shaderProgram);

	// Get attribute/uniform locations.
	const posLoc = context.getAttribLocation(shaderProgram, "aVertexPosition");

	timeUniformLocation = context.getUniformLocation(shaderProgram, "uTime");
	resolutionUniformLocation = context.getUniformLocation(shaderProgram, "uResolution");
	lightModeUniformLocation = context.getUniformLocation(shaderProgram, "uLightMode");

	// Full-screen quad buffer.
	const buffer = context.createBuffer();
	context.bindBuffer(context.ARRAY_BUFFER, buffer);

	const verts = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]);

	context.bufferData(context.ARRAY_BUFFER, verts, context.STATIC_DRAW);
	context.enableVertexAttribArray(posLoc);
	context.vertexAttribPointer(posLoc, 2, context.FLOAT, false, 0, 0);

	requestAnimationFrame(renderFrame);
}

initializeWebGL();

// Set clear color and mode uniform.
function setWebGLMode(isLight) {
	if (isLight) {
		context.clearColor(1.0, 1.0, 1.0, 1.0);
		context.uniform1i(lightModeUniformLocation, 1);
	} else {
		context.clearColor(0.0, 0.0, 0.0, 0.0);
		context.uniform1i(lightModeUniformLocation, 0);
	}
}

// Draw each animation frame.
function renderFrame(timeMs) {
	context.clear(context.COLOR_BUFFER_BIT);

	const timeSec = timeMs * 0.001;

	context.uniform1f(timeUniformLocation, timeSec);
	context.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
	context.drawArrays(context.TRIANGLE_STRIP, 0, 4);

	requestAnimationFrame(renderFrame);
}


/***********************
* MODE TOGGLE BEHAVIOR *
***********************/

// Get elements that change with the mode.
const toggleModeBtn = document.getElementById("toggle-mode-btn");
const portfolioLink = document.getElementById("portfolio-link");

// Function to apply mode.
function applyMode(mode) {
	body.classList.remove("light-mode", "dark-mode");
	body.classList.add(mode);

	if (mode === "dark-mode") {
		// Set dark mode styles.
		toggleModeBtn.style.color = "rgb(245, 245, 245)";
		toggleModeBtn.innerHTML = '<i class="bi bi-sun-fill"></i>';

		portfolioLink.style.color = "rgb(245, 245, 245)";

		responsiveWarning.style.backgroundColor = "rgb(2, 4, 8)";

		setWebGLMode(false);
	} else {
		// Set light mode styles.
		toggleModeBtn.style.color = "rgb(2, 4, 8)";
		toggleModeBtn.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';

		portfolioLink.style.color = "rgb(2, 4, 8)";

		responsiveWarning.style.backgroundColor = "rgb(245, 245, 245)";

		setWebGLMode(true);
	}
}

// Check and apply saved mode on page load
let savedMode = localStorage.getItem("mode");

if (savedMode === null) {
	savedMode = "light-mode"; // Default mode.
}

applyMode(savedMode);

// Toggle mode and save preference.
toggleModeBtn.addEventListener("click", function () {
	let newMode;

	if (body.classList.contains("light-mode")) {
		newMode = "dark-mode";
	} else {
		newMode = "light-mode";
	}

	applyMode(newMode);

	// Save choice.
	localStorage.setItem("mode", newMode);
});