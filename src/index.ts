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
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Something CLI',
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

  const titleBox = grid.set(0, 0, 2, 6, blessed.box, {
    label: ' Info ',
    content: '{center}{bold}Something CLI{/bold}\nInitializing...{/center}',
    tags: true,
    style: { fg: 'cyan', border: { fg: 'cyan' } },
    border: { type: 'line' },
  }) as blessed.Widgets.BoxElement;

  const donut = grid.set(0, 6, 4, 6, contrib.donut, {
    label: ' Progress ',
    radius: 8,
    arcWidth: 3,
    remainColor: 'black',
    yPadding: 2,
    data: [{ percent: 0, label: 'Download', color: 'green' }],
    border: { type: 'line', fg: 'green' },
  }) as contrib.Widgets.DonutElement;

  const speedLine = grid.set(2, 0, 4, 6, contrib.line, {
    style: { line: 'yellow', text: 'green', baseline: 'black' },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeFile: true,
    label: ' Download Speed (MB/s) ',
    border: { type: 'line', fg: 'yellow' },
  }) as contrib.Widgets.LineElement;

  const peersTable = grid.set(4, 6, 4, 6, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: ' Connected Peers ',
    width: '30%',
    height: '30%',
    border: { type: 'line', fg: 'magenta' },
    columnSpacing: 3,
    columnWidth: [20, 15, 10],
  }) as contrib.Widgets.TableElement;

  const logBox = grid.set(6, 0, 6, 6, contrib.log, {
    label: ' Activity Log ',
    fg: 'green',
    selectedFg: 'green',
    border: { type: 'line', fg: 'green' },
  }) as blessed.Widgets.Log;

  const fileTable = grid.set(8, 6, 4, 6, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'black',
    selectedBg: 'cyan',
    interactive: true,
    label: ' Files (Press f to focus) ',
    border: { type: 'line', fg: 'white' },
    columnSpacing: 2,
    columnWidth: [40, 10],
  }) as contrib.Widgets.TableElement;

  const client = new WebTorrent();
  const speedData: { x: string[]; y: number[] } = { x: [], y: [] };

  client.add(torrentPath, { path: outputDir }, (torrent: Torrent) => {
    logBox.log(`Downloading: ${torrent.name}`);

    titleBox.setContent(
      `{center}{bold}${torrent.name}{/bold}\n` +
      `Size: ${(torrent.length / 1024 / 1024).toFixed(2)} MB{/center}`
    );
    screen.render();

    const fileList = torrent.files.map((f) => [
      f.name,
      (f.length / 1024 / 1024).toFixed(2) + ' MB',
    ]);
    fileTable.setData({ headers: ['File', 'Size'], data: fileList });

    torrent.files.forEach((file: TorrentFile) => {
      const filePath = path.join(outputDir, file.path);
      const fileDir = path.dirname(filePath);

      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      logBox.log(`Saving: ${filePath}`);

      file.createReadStream().pipe(fs.createWriteStream(filePath));

      file.on('done', () => {
        logBox.log(`Finished downloading ${file.name}`);
      });
    });
    // -------------------------------

    torrent.on('download', (bytes: number) => {
      const progress = Math.round(torrent.progress * 100);
      const speed = torrent.downloadSpeed / 1024 / 1024;

      donut.setData([
        { percent: progress.toString(), label: 'Progress', color: 'green' },
      ]);

      const now = new Date().toLocaleTimeString();
      if (speedData.x.length > 20) {
        speedData.x.shift();
        speedData.y.shift();
      }
      speedData.x.push(now);
      speedData.y.push(speed);

      speedLine.setData([
        { title: 'Speed', x: speedData.x, y: speedData.y, style: { line: 'yellow' } }
      ]);

      const downloaded = (torrent.downloaded / 1024 / 1024).toFixed(2);
      const total = (torrent.length / 1024 / 1024).toFixed(2);
      const timeRemaining = (torrent.timeRemaining / 1000 / 60).toFixed(1);

      titleBox.setContent(
        `{center}{bold}${torrent.name}{/bold}\n` +
        `{cyan-fg}${downloaded} / ${total} MB{/cyan-fg}\n` +
        `ETA: ${timeRemaining} min | Peers: ${torrent.numPeers}{/center}`
      );

      const peers = (torrent as any).wires.map((wire: any) => [
        wire.remoteAddress || 'Unknown',
        wire.type || 'TCP',
        (wire.downloaded / 1024).toFixed(0) + ' KB',
      ]);
      peersTable.setData({ headers: ['IP', 'Type', 'Down'], data: peers.slice(0, 10) });

      screen.render();
    });

    torrent.on('done', () => {
      donut.setData([{ percent: '100', label: 'Done', color: 'blue' }]);
      logBox.log('Download Complete!');
      screen.render();
      client.destroy();
    });

    (torrent as any).on('error', (err: Error) => {
      logBox.log(`Error: ${err.message}`);
    });

    screen.render();
  });

  client.on('error', (err: string | Error) => {
    logBox.log(`Client Error: ${err.toString()}`);
  });

  screen.on('resize', () => {
    titleBox.emit('resize');
    donut.emit('resize');
    speedLine.emit('resize');
    peersTable.emit('resize');
    logBox.emit('resize');
    fileTable.emit('resize');
    screen.render();
  });

  screen.key(['escape', 'q', 'C-c'], () => {
    return process.exit(0);
  });

  screen.key(['f'], () => {
    fileTable.focus();
  });

  screen.render();
};

startTorrentDownload(options.torrent, options.output);