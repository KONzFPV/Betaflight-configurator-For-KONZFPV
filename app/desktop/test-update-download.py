import contextlib,hashlib,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import route_transport as transport
class Response:
    status_code=200
    def __init__(self,data): self.data=data
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def iter_content(self,chunk_size):
        for start in range(0,len(self.data),2):yield self.data[start:start+2]
class Session:
    data=b'update-package'
    def __init__(self,**kwargs):pass
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def stream(self,*args,**kwargs):return Response(self.data)
class DownloadTests(unittest.TestCase):
    def job(self,file,**changes):
        return dict(id=1,path='/updates/download/v10/update.zip',file=str(file),bytes=len(Session.data),sha256=hashlib.sha256(Session.data).hexdigest(),**changes)
    def test_stream_and_verify(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(transport,'refresh'),patch.object(transport.requests,'Session',Session),contextlib.redirect_stdout(io.StringIO()):
            target=Path(directory)/'update.konz-download.part'
            result=transport.download_update(self.job(target))
            self.assertTrue(result['saved']);self.assertEqual(target.read_bytes(),Session.data)
    def test_bad_hash_removes_partial(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(transport,'refresh'),patch.object(transport.requests,'Session',Session),contextlib.redirect_stdout(io.StringIO()):
            target=Path(directory)/'update.konz-download.part';job=self.job(target);job['sha256']='0'*64
            with self.assertRaises(RuntimeError):transport.download_update(job)
            self.assertFalse(target.exists())
    def test_reject_path_traversal_and_unsafe_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'update.konz-download.part'
            for changes in [{'path':'/updates/download/../evil.zip'},{'file':str(Path(directory)/'settings.json')},{'bytes':2**40}]:
                job=self.job(target);job.update(changes)
                with self.assertRaises(ValueError):transport.download_update(job)
if __name__=='__main__':unittest.main()
