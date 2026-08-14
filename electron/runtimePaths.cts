import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

export type RuntimeStorageMode = 'development' | 'installed' | 'portable';
export type RuntimePathSource = 'argument' | 'environment' | 'portable' | 'installed' | 'development';

export interface RuntimePaths {
  mode: RuntimeStorageMode;
  source: RuntimePathSource;
  dataRoot: string;
  userDataPath: string;
  sessionDataPath: string;
  businessDataPath: string;
  logsPath: string;
}

interface RuntimePathOptions {
  isPackaged: boolean;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  resourcesPath?: string;
  moduleDirectory?: string;
}

interface DataRootDescriptor {
  dataRoot?: unknown;
}

const DATA_DIRECTORY_NAME = '欧包音乐数据';
const DESCRIPTOR_FILE_NAME = 'data-root.json';

export function prepareRuntimePaths(options: RuntimePathOptions): RuntimePaths {
  const runtimePaths = resolveRuntimePaths(options);
  ensureWritableDirectory(runtimePaths.dataRoot);
  ensureWritableDirectory(runtimePaths.userDataPath);
  ensureWritableDirectory(runtimePaths.sessionDataPath);
  ensureWritableDirectory(runtimePaths.businessDataPath);
  ensureWritableDirectory(runtimePaths.logsPath);
  return runtimePaths;
}

export function resolveRuntimePaths(options: RuntimePathOptions): RuntimePaths {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const explicitArgument = getArgumentValue(argv, '--obao-data-dir') ?? getArgumentValue(argv, '--oubao-data-dir');
  const environmentDirectory = env.OBAO_MUSIC_DATA_DIR?.trim() ?? env.OUBAO_MUSIC_DATA_DIR?.trim();
  const packaged = options.isPackaged;
  const execPath = options.execPath ?? process.execPath;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const moduleDirectory = options.moduleDirectory ?? __dirname;

  let mode: RuntimeStorageMode;
  let source: RuntimePathSource;
  let dataRoot: string;

  if (explicitArgument) {
    mode = packaged ? 'installed' : 'development';
    source = 'argument';
    dataRoot = explicitArgument;
  } else if (environmentDirectory) {
    mode = packaged ? 'installed' : 'development';
    source = 'environment';
    dataRoot = environmentDirectory;
  } else if (!packaged) {
    mode = 'development';
    source = 'development';
    dataRoot = path.resolve(moduleDirectory, '..', '.runtime', 'data');
  } else if (env.PORTABLE_EXECUTABLE_DIR?.trim()) {
    mode = 'portable';
    source = 'portable';
    dataRoot = path.join(env.PORTABLE_EXECUTABLE_DIR.trim(), DATA_DIRECTORY_NAME);
  } else {
    mode = 'installed';
    source = 'installed';
    dataRoot = readInstalledDataRoot(resourcesPath) ?? path.join(path.dirname(resourcesPath), '..', DATA_DIRECTORY_NAME);
  }

  const resolvedDataRoot = validateDataRoot(dataRoot, {
    mode,
    source,
    execPath,
    resourcesPath
  });

  return {
    mode,
    source,
    dataRoot: resolvedDataRoot,
    userDataPath: path.join(resolvedDataRoot, 'app'),
    sessionDataPath: path.join(resolvedDataRoot, 'chromium'),
    businessDataPath: path.join(resolvedDataRoot, 'data'),
    logsPath: path.join(resolvedDataRoot, 'logs')
  };
}

function getArgumentValue(argv: readonly string[], argumentName: string): string | null {
  const prefix = `${argumentName}=`;
  const inlineArgument = argv.find((argument) => argument.startsWith(prefix));
  if (inlineArgument) {
    return inlineArgument.slice(prefix.length).trim() || null;
  }

  const argumentIndex = argv.indexOf(argumentName);
  if (argumentIndex >= 0) {
    return argv[argumentIndex + 1]?.trim() || null;
  }

  return null;
}

function readInstalledDataRoot(resourcesPath: string): string | null {
  const descriptorPath = path.join(resourcesPath, DESCRIPTOR_FILE_NAME);
  if (!fs.existsSync(descriptorPath)) {
    return null;
  }

  try {
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as DataRootDescriptor;
    return typeof descriptor.dataRoot === 'string' && descriptor.dataRoot.trim() ? descriptor.dataRoot.trim() : null;
  } catch {
    throw new Error(`无法读取安装数据目录配置：${descriptorPath}`);
  }
}

function validateDataRoot(
  dataRoot: string,
  context: Pick<RuntimePathOptions, 'execPath' | 'resourcesPath'> & Pick<RuntimePaths, 'mode' | 'source'>
): string {
  if (!dataRoot || !path.isAbsolute(dataRoot)) {
    throw new Error('数据目录必须是绝对路径。');
  }

  const resolvedDataRoot = path.resolve(dataRoot);
  const parsed = path.parse(resolvedDataRoot);
  if (resolvedDataRoot === parsed.root) {
    throw new Error('数据目录不能是磁盘根目录。');
  }

  if (context.mode === 'portable') {
    return resolvedDataRoot;
  }

  const protectedRoots = [
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.WINDIR,
    process.env.SystemRoot,
    context.resourcesPath,
    context.execPath ? path.dirname(context.execPath) : undefined
  ].filter((value): value is string => Boolean(value));

  if (protectedRoots.some((protectedRoot) => isWithin(resolvedDataRoot, protectedRoot))) {
    throw new Error('数据目录不能位于应用安装目录或 Windows 受保护目录。请选择可写的非系统目录。');
  }

  return resolvedDataRoot;
}

function isWithin(candidate: string, parent: string): boolean {
  const relativePath = path.relative(path.resolve(parent), candidate);
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

function ensureWritableDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
  const probePath = path.join(directoryPath, `.obao-write-check-${process.pid}-${Date.now()}`);

  try {
    fs.writeFileSync(probePath, os.EOL, { flag: 'wx' });
  } catch (error) {
    throw new Error(`数据目录不可写：${directoryPath}（${getErrorMessage(error)}）`);
  } finally {
    try {
      fs.rmSync(probePath, { force: true });
    } catch {
      // The successful write is enough to validate the directory.
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
