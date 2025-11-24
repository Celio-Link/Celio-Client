import * as http from 'node:http';

const server = http.createServer((req, res) => {
  res.end("hello from server");
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
});
