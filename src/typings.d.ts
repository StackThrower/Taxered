// Markdown files are bundled as plain strings (see the `loader` option in angular.json).
declare module '*.md' {
  const content: string;
  export default content;
}
