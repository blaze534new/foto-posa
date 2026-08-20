const cameraView = document.querySelector("#cameraView");
const resultView = document.querySelector("#resultView");
const video = document.querySelector("#cameraVideo");
const overlay = document.querySelector("#guideOverlay");
const emptyState = document.querySelector("#emptyState");
const message = document.querySelector("#message");
const guideInput = document.querySelector("#guideInput");
const loadGuideButton = document.querySelector("#loadGuideButton");
const changeGuideButton = document.querySelector("#changeGuideButton");
const removeGuideButton = document.querySelector("#removeGuideButton");
const opacitySlider = document.querySelector("#opacitySlider");
const opacityLabel = document.querySelector("#opacityLabel");
const switchCameraButton = document.querySelector("#switchCameraButton");
const captureButton = document.querySelector("#captureButton");
const canvas = document.querySelector("#captureCanvas");
const resultImage = document.querySelector("#resultImage");
const saveLink = document.querySelector("#saveLink");
const retakeButton = document.querySelector("#retakeButton");
const backButton = document.querySelector("#backButton");

let stream = null;
let facingMode = "user";
let guideObjectUrl = null;
let resultObjectUrl = null;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("is-error", isError);
}

function updateEmptyState() {
  const hasCamera = Boolean(stream);
  const hasGuide = Boolean(overlay.src) && !overlay.hidden;
  emptyState.hidden = hasCamera && hasGuide;
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function startCamera() {
  if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    setMessage("Browser non compatibile: serve un browser moderno con getUserMedia().", true);
    updateEmptyState();
    return;
  }

  stopCamera();
  setMessage("Apro la fotocamera...");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    video.srcObject = stream;
    video.classList.toggle("is-front", facingMode === "user");
    await video.play();
    setMessage("Fotocamera pronta. Scegli una foto guida.");
  } catch (error) {
    stopCamera();
    const insecure = location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
    const reason = insecure
      ? "La fotocamera richiede HTTPS oppure localhost."
      : "Permesso negato o fotocamera non disponibile.";
    setMessage(`${reason} Dettaglio: ${error.message || error.name}`, true);
  } finally {
    updateEmptyState();
  }
}

function revokeGuideUrl() {
  if (guideObjectUrl) {
    URL.revokeObjectURL(guideObjectUrl);
    guideObjectUrl = null;
  }
}

function setGuide(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    setMessage("File immagine non valido. Scegli JPG, PNG o WEBP se supportato.", true);
    return;
  }

  revokeGuideUrl();
  guideObjectUrl = URL.createObjectURL(file);
  overlay.src = guideObjectUrl;
  overlay.hidden = false;
  changeGuideButton.hidden = false;
  removeGuideButton.hidden = false;
  loadGuideButton.textContent = "Carica foto guida";
  setMessage("Foto guida caricata. Regola l'opacita e mettiti in posa.");
  updateEmptyState();
}

function removeGuide() {
  revokeGuideUrl();
  overlay.removeAttribute("src");
  overlay.hidden = true;
  guideInput.value = "";
  changeGuideButton.hidden = true;
  removeGuideButton.hidden = true;
  setMessage("Foto guida rimossa.");
  updateEmptyState();
}

function updateOpacity() {
  const value = Number(opacitySlider.value);
  overlay.style.opacity = String(value / 100);
  opacityLabel.textContent = `Opacità foto guida: ${value}%`;
}

function timestampFileName() {
  const pad = (number) => String(number).padStart(2, "0");
  const now = new Date();
  return [
    "foto-posa",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
}

function showResult(blob) {
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = URL.createObjectURL(blob);
  resultImage.src = resultObjectUrl;
  saveLink.href = resultObjectUrl;
  saveLink.download = timestampFileName();
  cameraView.classList.remove("is-active");
  resultView.classList.add("is-active");
}

function capturePhoto() {
  try {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!stream || !width || !height) {
      setMessage("La fotocamera non e pronta per lo scatto.", true);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });

    context.save();
    if (facingMode === "user") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, width, height);
    context.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("Errore durante la creazione della foto.", true);
          return;
        }
        showResult(blob);
      },
      "image/jpeg",
      0.95
    );
  } catch (error) {
    setMessage(`Errore durante lo scatto: ${error.message || error.name}`, true);
  }
}

function returnToCamera() {
  resultView.classList.remove("is-active");
  cameraView.classList.add("is-active");
}

function openGuidePicker() {
  guideInput.value = "";
  guideInput.click();
}

loadGuideButton.addEventListener("click", openGuidePicker);
changeGuideButton.addEventListener("click", openGuidePicker);
removeGuideButton.addEventListener("click", removeGuide);

guideInput.addEventListener("change", () => {
  const [file] = guideInput.files;
  setGuide(file);
});

opacitySlider.addEventListener("input", updateOpacity);

switchCameraButton.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  await startCamera();
});

captureButton.addEventListener("click", capturePhoto);
retakeButton.addEventListener("click", returnToCamera);
backButton.addEventListener("click", returnToCamera);

window.addEventListener("pagehide", () => {
  stopCamera();
  revokeGuideUrl();
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
});

updateOpacity();
startCamera();
