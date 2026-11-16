import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

it('initialize rejects a wrong configured x asset before registration or storage writes',()=>{
 h.ok(h.call('set-verified-contract',[Cl.principal(h.market)],h.owner,'jing-core-v6'));
 const args=[Cl.principal(h.market),h.token,h.yToken,h.U(100),h.U(10000),h.U(45),h.U(7)];
 args[1]=h.wrong;
 const before=h.auditState();
 const refused=simnet.callPublicFn(h.C,'initialize',args,h.owner);
 h.err(refused,1013);expect(h.auditState()).toBe(before);
 args[1]=h.token;
 h.ok(simnet.callPublicFn(h.C,'initialize',args,h.owner));
 expect(simnet.getDataVar(h.C,'initialized')).toEqual(Cl.bool(true));
});

it('initialize rejects a wrong configured y asset before registration or storage writes',()=>{
 h.ok(h.call('set-verified-contract',[Cl.principal(h.market)],h.owner,'jing-core-v6'));
 const args=[Cl.principal(h.market),h.token,h.yToken,h.U(100),h.U(10000),h.U(45),h.U(7)];
 args[2]=h.wrong;
 const before=h.auditState();
 const refused=simnet.callPublicFn(h.C,'initialize',args,h.owner);
 h.err(refused,1013);expect(h.auditState()).toBe(before);
 args[2]=h.yToken;
 h.ok(simnet.callPublicFn(h.C,'initialize',args,h.owner));
 expect(simnet.getDataVar(h.C,'initialized')).toEqual(Cl.bool(true));
});
