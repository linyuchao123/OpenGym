// @vitest-environment happy-dom
import {it,expect,vi,afterEach} from 'vitest'
import {api} from './api.js'
import {useStore} from '../store/useStore.js'
import {refreshUnread,resetUnread,useUnread} from './unread.js'
vi.mock('./api.js',()=>({api:vi.fn()}))
afterEach(()=>{resetUnread();vi.resetAllMocks()})
it('deduplicates badge requests and discards responses after account switching',async()=>{let finish;useStore.setState({user:{id:'a'}});api.mockImplementation(()=>new Promise(r=>finish=r));const a=refreshUnread(),b=refreshUnread();expect(api).toHaveBeenCalledTimes(1);useStore.setState({user:{id:'b'}});resetUnread('b');finish({total:7,messages:5,interactions:2});await Promise.all([a,b]);expect(useUnread.getState().count).toBe(0);api.mockResolvedValue({total:2,messages:1,interactions:1});await refreshUnread();expect(useUnread.getState()).toMatchObject({owner:'b',count:2});useStore.setState({user:null});await refreshUnread();expect(useUnread.getState().count).toBe(0)})
it('a forced refresh after marking read discards a stale badge response',async()=>{
 useStore.setState({user:{id:'a'}});let stale;
 api.mockImplementationOnce(()=>new Promise(r=>stale=r)).mockResolvedValueOnce({total:1,messages:1,interactions:0});
 const old=refreshUnread();await refreshUnread(true);expect(useUnread.getState().count).toBe(1);
 stale({total:16,messages:2,interactions:14});await old;expect(useUnread.getState().count).toBe(1);
});
