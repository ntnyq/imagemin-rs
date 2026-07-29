export function resolveSpawnCommand(
  command,
  arguments_,
  {
    commandInterpreter = process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe",
    platform = process.platform,
  } = {},
) {
  if (platform !== "win32" || /\.(?:com|exe)$/i.test(command)) {
    return { arguments: arguments_, command };
  }

  const commandShim = /\.(?:bat|cmd)$/i.test(command) ? command : `${command}.cmd`;
  return {
    arguments: ["/d", "/s", "/c", commandShim, ...arguments_],
    command: commandInterpreter,
  };
}
