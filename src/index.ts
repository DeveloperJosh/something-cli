import WebTorrent, { type Torrent, type TorrentFile } from 'webtorrent';
import path from 'path';
import fs from 'fs';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Command } from 'commander';

const program = new Command();
program
  .version('1.0.0')
  .description('Something CLI, a CLI tool to download torrents')
  .requiredOption('-t, --torrent <path>', 'Path to the torrent file or link')
  .requiredOption('-o, --output <path>', 'Output directory', './downloads')
  .parse(process.argv);

const options = program.opts();

const startTorrentDownload = (torrentPath: string, outputDir: string) => {
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Initialize TUI
  const screen = blessed.screen();
  const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

  const infoBox = grid.set(0, 0, 6, 12, blessed.box, {
    label: 'Torrent Info',
    content: 'Loading...',
    tags: true,
    border: { type: 'line', fg: 'cyan' },
    style: { fg: 'white' },
  }) as blessed.Widgets.BoxElement;

  const logBox = grid.set(6, 0, 6, 12, contrib.log, {
    label: 'Logs',
    fg: 'green',
    selectedFg: 'green',
    height: '100%',
    border: { type: 'line', fg: 'cyan' },
  }) as blessed.Widgets.Log;

  const client = new WebTorrent();

  client.add(torrentPath, { path: outputDir }, (torrent: Torrent) => {
    logBox.log(`Downloading: ${torrent.name}`);

    infoBox.setContent(
      `Torrent: {bold}${torrent.name}{/bold}\nTotal Size: ${(torrent.length / 1024 / 1024).toFixed(2)} MB\nStatus: Downloading...`
    );
    screen.render();

    torrent.files.forEach((file: TorrentFile) => {
      const filePath = path.join(outputDir, file.path);
      const fileDir = path.dirname(filePath);

      // Ensure the directory for the file exists
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      logBox.log(`Saving: ${filePath}`);

      // Create a write stream to save the file
      file.createReadStream().pipe(fs.createWriteStream(filePath));

      file.on('done', () => {
        logBox.log(`Finished downloading ${file.name}`);
      });
    });

    torrent.on('download', (bytes: number) => {
      const progress = torrent.progress * 100;
      const downloaded = (torrent.downloaded / 1024 / 1024).toFixed(2); // In MB
      const total = (torrent.length / 1024 / 1024).toFixed(2); // In MB
      const speed = (torrent.downloadSpeed / 1024 / 1024).toFixed(2); // In MB/s
      const timeRemaining = (torrent.timeRemaining / 1000 / 60).toFixed(2); // In minutes

      infoBox.setContent(
        `Torrent: {bold}${torrent.name}{/bold}\nTotal Size: ${total} MB\nDownloaded: ${downloaded} MB\nSpeed: ${speed} MB/s\nTime Remaining: ${timeRemaining} min\nStatus: Downloading...`
      );
      screen.render();

      logBox.log(
        `Progress: ${progress.toFixed(2)}%, Downloaded: ${downloaded}MB/${total}MB, Speed: ${speed}MB/s, Time Remaining: ${timeRemaining} min`
      );
    });

    torrent.on('done', () => {
      infoBox.setContent(
        `Torrent: {bold}${torrent.name}{/bold}\nTotal Size: ${(torrent.length / 1024 / 1024).toFixed(2)} MB\nStatus: Download Complete!`
      );
      screen.render();
      logBox.log('All files downloaded');
      client.destroy(); // Close the client when done
    });

    // Using type assertion to avoid type error
    (torrent as any).on('error', (err: Error) => {
      logBox.log(`Error: ${err.message}`);
    });

    screen.render();
  });

  // Listen for errors on the client as well
  client.on('error', (err: string | Error) => {
    logBox.log(`Client Error: ${err.toString()}`);
  });

  // Handle screen resize
  screen.on('resize', () => {
    infoBox.emit('resize');
    logBox.emit('resize');
    screen.render();
  });

  // Quit on Escape, q, or Control-C.
  screen.key(['escape', 'q', 'C-c'], () => {
    return process.exit(0);
  });

  screen.render();
};

// Start the torrent download with user-provided arguments
startTorrentDownload(options.torrent, options.output);
