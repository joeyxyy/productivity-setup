const { app, BrowserWindow, powerSaveBlocker, shell } = require("electron");
const path = require("node:path");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let powerBlockerId = null;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 360,
    minHeight: 640,
    title: "Productivity Setup",
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));
};

app.whenReady().then(() => {
  powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
