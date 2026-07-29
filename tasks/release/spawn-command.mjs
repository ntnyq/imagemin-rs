export function resolveSpawnCommand(
  command,
  arguments_,
  {
    commandInterpreter = process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe",
    platform = process.platform,
  } = {},
) {
  if (platform !== "win32") {
    return { arguments: arguments_, command };
  }

  return {
    arguments: ["/d", "/s", "/c", `${command}.cmd`, ...arguments_],
    command: commandInterpreter,
  };
}
