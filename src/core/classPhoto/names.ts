export function filenameToDisplayName(filename: string): string {
  const withoutPath = filename.split(/[\\/]/).at(-1) ?? filename;
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
