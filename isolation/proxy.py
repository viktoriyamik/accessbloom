#!/usr/bin/env python3
"""Restricted HTTPS CONNECT proxy. DNS is resolved and public IP pinned at connect time."""
import asyncio, ipaddress, socket, os
PORT=3128
async def handler(reader,writer):
    upstream=None
    try:
        head=await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'),8)
        if len(head)>8192: raise ValueError()
        request=head.split(b'\r\n',1)[0].decode('ascii','strict').split()
        if len(request)!=3 or request[0]!='CONNECT': raise ValueError()
        target=request[1]
        if target.count(':')!=1: raise ValueError()
        host,port=target.rsplit(':',1)
        if port!='443' or len(host)>253 or not host or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in host.lower()): raise ValueError()
        if host.startswith('-') or host.endswith('-') or '..' in host: raise ValueError()
        infos=await asyncio.get_running_loop().getaddrinfo(host,443,type=socket.SOCK_STREAM)
        ips=sorted({i[4][0] for i in infos})
        if not ips or not all(ipaddress.ip_address(ip).is_global for ip in ips): raise ValueError()
        # Socket connects to the pinned IP, never resolving host a second time.
        ur,upstream=await asyncio.wait_for(asyncio.open_connection(ips[0],443),8)
        writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n');await writer.drain()
        async def pipe(src,dst):
            try:
                while True:
                    data=await asyncio.wait_for(src.read(32768),35)
                    if not data: break
                    dst.write(data);await dst.drain()
            except (asyncio.TimeoutError,ConnectionError,OSError): pass
        tasks=[asyncio.create_task(pipe(reader,upstream)),asyncio.create_task(pipe(ur,writer))]
        done,pending=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
        for task in pending:task.cancel()
    except (Exception,):
        try:writer.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length:0\r\n\r\n');await writer.drain()
        except Exception:pass
    finally:
        if upstream:upstream.close()
        writer.close()
async def main():
    server=await asyncio.start_server(handler,'0.0.0.0',PORT,limit=8192)
    async with server:await server.serve_forever()
asyncio.run(main())
