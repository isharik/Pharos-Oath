(() => {
  'use strict';
  const NETWORKS = {
    atlantic: {name:'Pharos Atlantic Testnet',chainId:688689,chainIdHex:'0xa8231',caip2:'eip155:688689',nativeSymbol:'PHRS',rpcUrl:'https://atlantic.dplabs-internal.com',explorer:'https://atlantic.pharosscan.xyz'},
    pacific: {name:'Pharos Pacific Mainnet',chainId:1672,chainIdHex:'0x688',caip2:'eip155:1672',nativeSymbol:'PROS',rpcUrl:'https://rpc.pharos.xyz',explorer:'https://www.pharosscan.xyz'}
  };
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  let activeNetwork = localStorage.getItem('oath.network') || 'atlantic';
  let activeSource = localStorage.getItem('oath.source') || 'auto';
  const currentNetwork = () => NETWORKS[activeNetwork] || NETWORKS.atlantic;
  let wallet = localStorage.getItem('oath.wallet') || '';
  let investigationKind = 'address';
  let watchTimer = null, toastTimer = null, rpcId = 1;
  const history = read('oath.history', []);
  const policy = read('oath.policy', {max:'1', maxApproval:'1', blocked:[], trusted:[]});
  function read(key, fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
  function save(key, value){localStorage.setItem(key,JSON.stringify(value))}
  function short(s, a=8, b=6){return s&&s.length>a+b+3?`${s.slice(0,a)}…${s.slice(-b)}`:s||'—'}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function showToast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000)}
  async function rpc(method, params=[]){const response=await fetch('/api/chain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({network:activeNetwork,method,params,source:activeSource})});const data=await response.json();if(!response.ok)throw new Error(data.error||`Chain query returned HTTP ${response.status}`);if(data.source&&$('#home-source-status'))$('#home-source-status').textContent=`Read via ${data.source}`;return data.result}
  async function networkCheck(){setNet('Checking…','pending');try{const [id,block]=await Promise.all([rpc('eth_chainId'),rpc('eth_blockNumber')]);const network=currentNetwork();const parsed=parseInt(id,16);if(parsed!==network.chainId)throw new Error(`RPC chain ID is ${parsed}, expected ${network.chainId}`);const n=parseInt(block,16);$('#network-name').textContent=activeNetwork==='atlantic'?'Atlantic testnet':'Pacific mainnet';$('#network-state').textContent=`Connected · block ${n.toLocaleString()}`;$('#home-network-status').textContent=`${network.name} · block ${n.toLocaleString()}`;$('#rpc-status').textContent='Operational';$('#network-summary').textContent=`${activeNetwork==='atlantic'?'Atlantic':'Pacific'} · chain ${network.chainId}`;$$('.network-pill').forEach(x=>x.innerHTML=`<i class="status-dot" id="top-dot"></i> ${activeNetwork==='atlantic'?'ATLANTIC TESTNET':'PACIFIC MAINNET'}`);$$('.native-symbol').forEach(x=>x.textContent=network.nativeSymbol);setDot(true);refreshIntegrationStatus()}catch(e){$('#network-name').textContent=activeNetwork==='atlantic'?'Atlantic testnet':'Pacific mainnet';$('#network-state').textContent=activeSource==='mcp'?'MCP unavailable for this network or call':'RPC unavailable';$('#home-network-status').textContent=e.message;$('#rpc-status').textContent='Unavailable';$('#network-summary').textContent=`Chain ${currentNetwork().chainId} · source unavailable`;setDot(false);console.warn('Pharos chain read:',e.message)}}
  function setDot(ok){['#net-dot','#top-dot','#metric-dot','#footer-dot'].forEach(s=>{let e=$(s);if(e)e.style.background=ok?'#52d89d':'#c57d6a'});$('#network-state').style.color=ok?'#6acba2':'#c58d7e'}
  function setNet(text){$('#network-state').textContent=text}
  async function refreshIntegrationStatus(){const [integrations,config]=await Promise.all([fetch(`/api/integrations?network=${activeNetwork}`).then(r=>r.json()).catch(()=>null),fetch('/api/config').then(r=>r.json()).catch(()=>null)]);if(config){const ai=$('#agent-config-status');if(ai)ai.textContent=config.ai?.configured?'LLM configured · optional assistant':'LLM not configured · Skill Engine fallback active';}const chain=integrations?.integrations?.chainMcp;const chip=$('#chain-mcp-status');if(chip){chip.textContent=chain?.status==='connected'&&chain.selectedNetworkCompatible?'CHAIN MCP · CONNECTED':chain?.status==='connected'?'CHAIN MCP · PACIFIC ONLY':chain?.status==='unavailable'?'CHAIN MCP · UNAVAILABLE':'CHAIN MCP · RPC FALLBACK';}const docs=integrations?.integrations?.developerDocs;const docsLabel=$('#docs-index-status');if(docsLabel)docsLabel.textContent=docs?.status==='connected'?'Developer docs · llms.txt online':'Developer docs · unavailable';const skill=integrations?.integrations?.skillEngine;const skillLabel=$('#skill-engine-status');if(skillLabel)skillLabel.textContent=skill?.status==='ready'?`Skill Engine · ${skill.workflowCount} workflows`:'Skill Engine · unavailable';checkMarketStatus();updateRegistryStatus()}
  function nav(view){$('#landing-page').hidden=true;$('.shell').hidden=false;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const name=$(`.nav-item[data-view="${view}"]`)?.textContent.trim()||view;$('#crumb-current').textContent=name.toUpperCase();$('#sidebar').classList.remove('open');$('.shell').classList.toggle('nav-collapsed',window.matchMedia('(max-width: 800px)').matches);const expanded=!window.matchMedia('(max-width: 800px)').matches;$('#mobile-menu').setAttribute('aria-expanded',String(expanded));$('#mobile-menu').setAttribute('aria-label',expanded?'Close navigation':'Open navigation');window.scrollTo({top:0,behavior:'smooth'});if(view==='activity')renderLedger();if(view==='wallet')refreshWallet()}
  $('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)nav(b.dataset.view)});
  $$('[data-goto]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.goto)));
  $$('[data-enter-workspace]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.enterWorkspace)));
  $('#back-to-landing').addEventListener('click',()=>{$('.shell').hidden=true;$('#landing-page').hidden=false;window.scrollTo({top:0,behavior:'smooth'})});
  $('#layer-motion-toggle').addEventListener('click',e=>{const paused=document.body.classList.toggle('motion-paused');e.currentTarget.setAttribute('aria-pressed',String(paused));e.currentTarget.textContent=paused?'Play motion':'Pause motion'});
  $$('[data-action="connect"]').forEach(b=>b.addEventListener('click',connectWallet));
  function closeSidebar(){const side=$('#sidebar');side.classList.remove('open');$('.shell').classList.add('nav-collapsed');$('#mobile-menu').setAttribute('aria-expanded','false');$('#mobile-menu').setAttribute('aria-label','Open navigation')}
  function toggleSidebar(){const side=$('#sidebar');if(window.matchMedia('(max-width: 800px)').matches){const open=!side.classList.contains('open');side.classList.toggle('open',open);$('.shell').classList.toggle('nav-collapsed',!open);$('#mobile-menu').setAttribute('aria-expanded',String(open));$('#mobile-menu').setAttribute('aria-label',open?'Close navigation':'Open navigation')}else{const open=$('.shell').classList.contains('nav-collapsed');$('.shell').classList.toggle('nav-collapsed',!open);$('#mobile-menu').setAttribute('aria-expanded',String(open));$('#mobile-menu').setAttribute('aria-label',open?'Close navigation':'Open navigation')}}
  const mobileNav=window.matchMedia('(max-width: 800px)').matches;$('#mobile-menu').setAttribute('aria-expanded',String(!mobileNav));$('#mobile-menu').setAttribute('aria-label',mobileNav?'Open navigation':'Close navigation');$('#mobile-menu').addEventListener('click',toggleSidebar);$('#sidebar-close').addEventListener('click',closeSidebar);$('#sidebar-scrim').addEventListener('click',closeSidebar);
  $('#refresh-network').addEventListener('click',networkCheck);
  $('#network-select').value=activeNetwork;
  $('#source-select').value=activeSource;
  $('#source-select').addEventListener('change',e=>{activeSource=e.target.value;localStorage.setItem('oath.source',activeSource);$('#home-source-status').textContent=`Read source · ${activeSource==='auto'?'Automatic':activeSource.toUpperCase()}`;networkCheck();refreshWallet();if(activeSource==='mcp'&&activeNetwork==='atlantic')showToast('The hosted MCP serves Pacific. Atlantic requires a chain 688689 MCP endpoint.')});
  $('#network-select').addEventListener('change',async e=>{activeNetwork=e.target.value;localStorage.setItem('oath.network',activeNetwork);const net=currentNetwork();$('#network-name').textContent=activeNetwork==='atlantic'?'Atlantic testnet':'Pacific mainnet';if(wallet&&window.ethereum){try{await walletChain()}catch(error){showToast(error.code===4001?'Network change was rejected.':'Wallet network could not be changed: '+error.message)}}updateNetworkUI();networkCheck();refreshWallet();if(watchTimer){stopWatch();showToast('OATH Watch paused because the network changed. Review and restart it.')}});
  function updateNetworkUI(){$('#network-select').value=activeNetwork;const n=currentNetwork();$('#network-summary').textContent=`${activeNetwork==='atlantic'?'Atlantic':'Pacific'} · chain ${n.chainId}`;$$('.native-symbol').forEach(x=>x.textContent=n.nativeSymbol);const asset=$('.asset-select b'),limit=$('#policy-native-symbol'),footer=$('.footer-network');if(asset)asset.textContent=n.nativeSymbol;if(limit)limit.textContent=n.nativeSymbol;if(footer)footer.textContent=activeNetwork==='atlantic'?'PHAROS ATLANTIC TESTNET':'PHAROS PACIFIC MAINNET';if($('#gate-network-name'))$('#gate-network-name').textContent=n.name;if($('#gate-chain-id'))$('#gate-chain-id').textContent=String(n.chainId);if($('#wallet-network-name'))$('#wallet-network-name').textContent=n.name.replace('Pharos ','');}
  async function connectWallet(){if(!window.ethereum){showToast('No browser wallet found. Install MetaMask or another EIP-1193 wallet.');return}try{const accounts=await ethereum.request({method:'eth_requestAccounts'});if(!accounts.length)return;wallet=accounts[0];localStorage.setItem('oath.wallet',wallet);await walletChain();renderWallet();showToast('Wallet connected. OATH never receives your keys.')}catch(e){showToast(e.code===4001?'Wallet connection was rejected.':e.message||'Wallet connection failed.')}}
  async function walletChain(){if(!window.ethereum)return;const n=currentNetwork();try{const id=await ethereum.request({method:'eth_chainId'});if(parseInt(id,16)!==n.chainId){try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:n.chainIdHex}]})}catch(e){if(e.code===4902)await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:n.chainIdHex,chainName:n.name,nativeCurrency:{name:n.nativeSymbol,symbol:n.nativeSymbol,decimals:18},rpcUrls:[n.rpcUrl],blockExplorerUrls:[n.explorer]}]});else throw e}}}catch(e){if(e.code!==4001)throw e}}
  function renderWallet(){const connected=!!wallet;$('#connect-wallet').innerHTML=connected?`<span>◉</span> ${esc(short(wallet,6,4))}`:'<span>◉</span> Connect wallet';$('#wallet-address').textContent=connected?short(wallet,7,6):'Not connected';$('#wallet-full').textContent=connected?wallet:'Connect a browser wallet to get started';$('#wallet-menu').textContent=connected?wallet.slice(2,4).toUpperCase():'—';$('#disconnect-wallet').hidden=!connected;$('#disconnect-wallet-topbar').hidden=!connected;$$('.landing-connect').forEach(button=>button.textContent=connected?`Connected · ${short(wallet,5,3)}`:'Connect wallet');if(connected){$('#watch-address').value=$('#watch-address').value||wallet;refreshWallet()}else{$('#wallet-balance').textContent='Connect a wallet to read balance';$('#wallet-full-balance').textContent='Account details are read live from the chain.';$('#wallet-read-balance').textContent='—';$('#wallet-nonce').textContent='—'}}
  function disconnectWallet(notify=true){wallet='';localStorage.removeItem('oath.wallet');stopWatch();renderWallet();if(notify)showToast('Disconnected from OATH on this device. Wallet site access is managed in your wallet app.')}
  $('#connect-wallet').addEventListener('click',connectWallet);$('#wallet-menu').addEventListener('click',()=>wallet?nav('wallet'):connectWallet());$('#disconnect-wallet').addEventListener('click',()=>disconnectWallet());$('#disconnect-wallet-topbar').addEventListener('click',()=>disconnectWallet());
  if(window.ethereum){ethereum.on?.('accountsChanged',a=>{wallet=a[0]||'';if(wallet)localStorage.setItem('oath.wallet',wallet);else localStorage.removeItem('oath.wallet');if(!wallet)stopWatch();renderWallet()});ethereum.on?.('chainChanged',()=>{networkCheck();refreshWallet()})}
  async function refreshWallet(){if(!wallet)return;try{const [bal,nonce]=await Promise.all([rpc('eth_getBalance',[wallet,'latest']),rpc('eth_getTransactionCount',[wallet,'latest'])]);const amount=Number(BigInt(bal))/1e18;const pretty=amount.toLocaleString(undefined,{maximumFractionDigits:6})+' '+currentNetwork().nativeSymbol;$('#wallet-balance').textContent=pretty;$('#wallet-full-balance').textContent=`${pretty} · ${new Date().toLocaleTimeString()}`;$('#wallet-read-balance').textContent=pretty;$('#wallet-nonce').textContent=String(parseInt(nonce,16))}catch(e){showToast(`Wallet read failed: ${e.message}`)}}
  $('#refresh-wallet').addEventListener('click',refreshWallet);
  function addRecord(record){history.unshift({...record,id:Date.now(),time:new Date().toISOString()});if(history.length>100)history.length=100;save('oath.history',history);updateCounts();renderRecent()}
  function updateCounts(){$('#investigation-count').innerHTML=`${history.length} <small>reports</small>`}
  function renderRecent(){const host=$('#recent-list');if(!history.length){host.innerHTML='<div class="empty-row"><span class="empty-mark">⌕</span><span>No investigations yet</span><small>Run a chain-backed investigation to create your first record.</small></div>';return}host.innerHTML=history.slice(0,3).map(row=>`<div class="ledger-row"><div><b>${esc(row.title)}</b><small>${new Date(row.time).toLocaleString()}</small></div><span class="ledger-hash">${esc(short(row.target||'Network check',18,10))}</span><span class="classification ${row.classification==='VERIFIED'?'verified':'caution'}">${esc(row.classification)}</span></div>`).join('')}
  function renderLedger(){const host=$('#ledger-list');if(!history.length){host.innerHTML='<div class="empty-row"><span class="empty-mark">≡</span><span>No saved investigations</span><small>Your reports are stored locally after each successful lookup.</small></div>';return}host.innerHTML=history.map(r=>`<div class="ledger-row"><div><b>${esc(r.title)}</b><small>${new Date(r.time).toLocaleString()} · ${esc(r.kind)}</small></div><span class="ledger-hash">${esc(r.target||'Network data')}</span><span class="classification ${r.classification==='VERIFIED'?'verified':'caution'}">${esc(r.classification)}</span></div>`).join('')}
  $('#clear-history').addEventListener('click',()=>{history.splice(0);save('oath.history',history);updateCounts();renderLedger();renderRecent();showToast('Local investigation history cleared.')});
  function classification(type,code){if(type==='contract'&&code&&code!=='0x')return ['CAUTION','caution'];return ['UNKNOWN','']}
  function setResult(host,heading,cls,fields,notes,summary=''){const [label,kind]=cls;$(host).innerHTML=`<div class="result-card"><div class="result-heading"><b>${esc(heading)}</b><span class="classification ${kind}">${label}</span></div>${summary?`<p class="muted">${esc(summary)}</p>`:''}<div class="result-data">${fields.map(([k,v])=>`<div class="fact-box"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div><ul class="evidence-list">${notes.map((n,i)=>`<li class="${i?'unknown':''}">${esc(n)}</li>`).join('')}</ul></div>`}
  function validAddress(a){return /^0x[a-fA-F0-9]{40}$/.test(a)}function validHash(h){return /^0x[a-fA-F0-9]{64}$/.test(h)}
  $$('.tab').forEach(t=>t.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===t));investigationKind=t.dataset.kind;$('#investigate-label').textContent=investigationKind==='address'?'ADDRESS TO INVESTIGATE':investigationKind==='transaction'?'TRANSACTION HASH':'NETWORK QUESTION';$('#investigate-input').placeholder=investigationKind==='address'?'0x…':investigationKind==='transaction'?'0x…':'e.g. latest block and network status';$('#investigate-hint').textContent=investigationKind==='address'?'Reads native balance, bytecode, nonce, and latest block from Pharos Atlantic.':investigationKind==='transaction'?'Retrieves transaction parameters and execution receipt from Pharos Atlantic.':'Reads current chain ID, latest block, and gas price from Pharos Atlantic.'}));
  async function inspectAddress(address,host='#investigation-result'){if(!validAddress(address)){showToast('Enter a valid 20-byte EVM address.');return}const out=$(host);out.innerHTML='<div class="panel result-card">Reading Pharos RPC…</div>';try{const [balance,code,nonce,block]=await Promise.all([rpc('eth_getBalance',[address,'latest']),rpc('eth_getCode',[address,'latest']),rpc('eth_getTransactionCount',[address,'latest']),rpc('eth_blockNumber')]);const isContract=code!=='0x'&&code!=='0x0';const [label,kind]=classification('contract',isContract?code:'');const bal=(Number(BigInt(balance))/1e18).toLocaleString(undefined,{maximumFractionDigits:7})+' '+currentNetwork().nativeSymbol;const fields=[['ADDRESS',address],['NATIVE BALANCE',bal],['BYTECODE',isContract?`${Math.max(0,(code.length-2)/2).toLocaleString()} bytes · deployed code detected`:'No code at latest block'],['TRANSACTION COUNT',String(parseInt(nonce,16))],['LATEST BLOCK',String(parseInt(block,16))]];const notes=[isContract?'Observed: eth_getCode returned deployed bytecode.':'Observed: eth_getCode returned 0x at latest block.',`Observed: native balance is ${bal}.`,`Observed: transaction count is ${parseInt(nonce,16)}.`,`Unknown: source verification, owner permissions, audit status, and contract intent were not established by these RPC reads.`];setResult(host,`Address investigation · ${short(address)}`,[label,kind],fields,notes);addRecord({title:isContract?'Contract inspection':'Address investigation',target:address,kind:'address',classification:label,network:activeNetwork});return{address,code,balance,nonce,block,isContract}}catch(e){out.innerHTML=`<div class="report-warning">Chain read failed: ${esc(e.message)}. Verify the ${currentNetwork().name} RPC endpoint and try again.</div>`;throw e}}
  async function inspectTx(hash,host='#tx-result'){if(!validHash(hash)){showToast('Enter a valid 32-byte transaction hash.');return}const out=$(host);out.innerHTML='<div class="panel result-card">Retrieving transaction and receipt…</div>';try{const [tx,receipt]=await Promise.all([rpc('eth_getTransactionByHash',[hash]),rpc('eth_getTransactionReceipt',[hash])]);if(!tx){out.innerHTML='<div class="report-warning">The RPC returned no transaction for this hash.</div>';return}let status='Pending';if(receipt)status=receipt.status==='0x1'?'Success':'Failed';const [label,kind]=status==='Failed'?['DANGER','danger']:['UNKNOWN',''];const fields=[['HASH',hash],['STATUS',status],['FROM',tx.from||'—'],['TO',tx.to||'Contract creation'],['VALUE',`${(Number(BigInt(tx.value||'0'))/1e18).toLocaleString(undefined,{maximumFractionDigits:7})} ${currentNetwork().nativeSymbol}`],['BLOCK',tx.blockNumber?String(parseInt(tx.blockNumber,16)):'Pending'],['GAS USED',receipt?.gasUsed?String(BigInt(receipt.gasUsed)): 'Not available'],['FUNCTION DATA',tx.input==='0x'?'Native call / empty data':`${Math.max(0,(tx.input.length-2)/2)} bytes · selector ${tx.input.slice(0,10)}`]];const notes=[`Observed: transaction ${receipt?'has a receipt':'has no receipt yet'} on the configured RPC.`,receipt?`Observed: execution status is ${status}.`: 'Unknown: final execution outcome until a receipt is available.',`Observed: sender ${tx.from||'unknown'}${tx.to?`, destination ${tx.to}`:', contract creation'}.`,`Unknown: function semantics for selector ${tx.input?.slice(0,10)||'—'} were not decoded; no verified ABI was supplied.`];setResult(host,`Transaction autopsy · ${short(hash)}`,[label,kind],fields,notes,status==='Failed'?'The receipt indicates execution failure. A specific cause cannot be established from status alone.':'This result describes RPC fields; it is not a security audit.');addRecord({title:'Transaction autopsy',target:hash,kind:'transaction',classification:label,network:activeNetwork})}catch(e){out.innerHTML=`<div class="report-warning">Transaction lookup failed: ${esc(e.message)}.</div>`;throw e}}
  $('#run-investigation').addEventListener('click',async()=>{const value=$('#investigate-input').value.trim();try{if(investigationKind==='address')await inspectAddress(value);else if(investigationKind==='transaction')await inspectTx(value,'#investigation-result');else await inspectNetwork('#investigation-result')}catch{}});
  $('#run-contract').addEventListener('click',()=>inspectAddress($('#contract-input').value.trim(),'#contract-result').catch(()=>{}));$('#run-tx').addEventListener('click',()=>inspectTx($('#tx-input').value.trim()).catch(()=>{}));
  async function inspectNetwork(host){const out=$(host);out.innerHTML='<div class="panel result-card">Reading Pharos network…</div>';try{const [id,block,gas]=await Promise.all([rpc('eth_chainId'),rpc('eth_blockNumber'),rpc('eth_gasPrice')]);const chain=parseInt(id,16);const gasGwei=Number(BigInt(gas))/1e9;const network=currentNetwork();const good=chain===network.chainId;setResult(host,`${network.name} investigation`,good?['VERIFIED','verified']:['DANGER','danger'],[['CHAIN ID',String(chain)],['LATEST BLOCK',String(parseInt(block,16))],['GAS PRICE',`${gasGwei.toFixed(5)} Gwei`],['RPC ENDPOINT',network.rpcUrl]],[`Observed: RPC reports chain ID ${chain}.`,`Observed: latest block is ${parseInt(block,16)}.`,`Observed: gas price is ${gasGwei.toFixed(5)} Gwei.`,good?'Unknown: network finality and validator health are not independently established.':`Risk: configured RPC does not match expected chain ID ${network.chainId}.`]);addRecord({title:'Network status check',kind:'network',classification:good?'VERIFIED':'DANGER',network:activeNetwork})}catch(e){out.innerHTML=`<div class="report-warning">Network query failed: ${esc(e.message)}.</div>`}}
  $$('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('#core-prompt').value=b.dataset.prompt;$('#core-prompt').focus()}));
  async function runCore(){const q=$('#core-prompt').value.trim();if(!q){showToast('Describe an investigation objective first.');return}const timeline=$('#core-timeline');const steps=$$('.timeline-step',timeline);steps.forEach(x=>x.classList.remove('done','running'));steps[0].classList.add('done');$('#core-workflow-status').textContent='OBJECTIVE RECEIVED';$('#report-area').innerHTML='<div class="report-card"><div class="report-content">OATH CORE is selecting a Pharos Skill Engine workflow…</div></div>';try{steps[1].classList.add('running');const walletRequested=/\b(my wallet|my balance|my holdings|my portfolio|connected wallet)\b/i.test(q);const payload={message:q,network:activeNetwork,source:activeSource,...(walletRequested&&wallet?{wallet}:{})};const response=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Agent request failed.');steps[1].classList.remove('running');steps[1].classList.add('done');steps[2].classList.add('done');steps[3].classList.add('done');$('#core-workflow-status').textContent=result.configured?'LLM · REPORT READY':'READ-ONLY REPORT READY';const evidence=(result.toolCalls||[]).map(c=>`<div class="fact-box"><small>${esc(c.name)} · STRUCTURED RESULT</small><b>${esc(JSON.stringify(c.result))}</b></div>`).join('');const stages=(result.timeline||[]).map(s=>`<li>${esc(s)}</li>`).join('');$('#report-area').innerHTML=`<div class="report-card"><div class="report-header"><b>OATH CORE investigation · ${esc(currentNetwork().name)}</b><span class="classification">${result.configured?'LLM':'READ ONLY'}</span></div><div class="report-content"><p class="agent-answer">${esc(result.answer||'No summary was returned.')}</p><div class="fact-grid">${evidence}</div><ul class="evidence-list">${stages}</ul><div class="workflow-note"><span>ⓘ</span><p>${result.configured?'LLM-assisted':'Skill Engine'} report. Tool results are evidence; contract data and tool output are treated as untrusted content.</p></div></div></div>`;const target=q.match(/0x[a-fA-F0-9]{64}|0x[a-fA-F0-9]{40}/)?.[0];addRecord({title:'OATH CORE investigation',target,kind:'agent',classification:(result.toolCalls||[]).some(c=>c.result?.classification==='DANGER')?'DANGER':'UNKNOWN',network:activeNetwork,report:result});}catch(error){steps[1].classList.remove('running');$('#core-workflow-status').textContent='INVESTIGATION FAILED';$('#report-area').innerHTML=`<div class="report-warning">${esc(error.message)}</div>`}}
  $('#run-core').addEventListener('click',runCore);$('#core-prompt').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')runCore()});
  function policyLines(value){return value.split(/[\n,\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
  function loadPolicyForm() {
    $('#policy-max-value').value = policy.max || '1';
    $('#policy-max-approval').value = policy.maxApproval || '1';
    $('#policy-blocked').value = (policy.blocked || []).join(String.fromCharCode(10));
    $('#policy-trusted').value = (policy.trusted || []).join(String.fromCharCode(10));
  }
  $('#save-policy').addEventListener('click', () => {
    const max = $('#policy-max-value').value.trim();
    const maxApproval = $('#policy-max-approval').value.trim();
    try { if (!max) throw new Error('missing'); amountToWei(max); } catch { showToast('Set a valid maximum native transfer amount.'); return; }
    if (!/^\d+(\.\d{1,36})?$/.test(maxApproval)) { showToast('Maximum token approval must be a non-negative decimal amount.'); return; }
    const blocked = policyLines($('#policy-blocked').value), trusted = policyLines($('#policy-trusted').value);
    if ([...blocked, ...trusted].some(address => !validAddress(address))) { showToast('Every policy address must be a valid EVM address.'); return; }
    policy.max = max;
    policy.maxApproval = maxApproval;
    policy.blocked = blocked;
    policy.trusted = trusted;
    save('oath.policy', policy);
    $('#policy-saved').textContent = 'Saved on this device';
    setTimeout(() => $('#policy-saved').textContent = '', 2500);
  });
  function amountToWei(value) {
    if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('Enter a positive amount with no more than 18 decimal places.');
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
  }
  function parseTokenUnits(value, decimals) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid token amount.');
    const [whole, fraction = ''] = value.split('.');
    if (fraction.length > decimals) throw new Error(`This token supports at most ${decimals} decimal places.`);
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  }
  function formatTokenUnits(value, decimals) {
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    if (decimals === 0) return String(whole);
    const fraction = String(value % divisor).padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : String(whole);
  }
  function addressPolicyErrors(address, role) {
    const errors = [];
    if (!validAddress(address)) errors.push(`${role} is not a valid 20-byte EVM address.`);
    if (address && (policy.blocked || []).includes(address.toLowerCase())) errors.push(`${role} is on your locally configured blocklist.`);
    if (address && (policy.trusted || []).length && !policy.trusted.includes(address.toLowerCase())) errors.push(`${role} is not on your locally configured trusted list.`);
    return errors;
  }
  function evaluateTransfer(to, amount) {
    const errors = addressPolicyErrors(to, 'Recipient');
    let wei = null;
    try { wei = amountToWei(amount); if (wei <= 0n) errors.push('Amount must be greater than zero.'); }
    catch (error) { errors.push(error.message); }
    try { if (wei !== null && policy.max && wei > amountToWei(String(policy.max))) errors.push(`Amount exceeds your local maximum of ${policy.max} ${currentNetwork().nativeSymbol}.`); }
    catch { errors.push('The saved native-transfer limit is invalid; update it in Policy Center.'); }
    if (!wallet) errors.push('Connect a wallet before proceeding.');
    return errors;
  }
  function evaluateApproval(spender, amount, decimals) {
    const errors = addressPolicyErrors(spender, 'Approval spender');
    if (!validAddress($('#gate-token').value.trim())) errors.push('Token contract is not a valid 20-byte EVM address.');
    let raw = null;
    try { raw = parseTokenUnits(amount, decimals); if (raw <= 0n) errors.push('Approval amount must be greater than zero.'); }
    catch (error) { errors.push(error.message); }
    try {
      const limit = parseTokenUnits(String(policy.maxApproval || '1'), decimals);
      if (raw !== null && raw > limit) errors.push(`Approval exceeds your local cap of ${policy.maxApproval || '1'} token units.`);
    } catch (error) { errors.push(`Saved token-approval cap is invalid for this token: ${error.message}`); }
    if (!wallet) errors.push('Connect a wallet before proceeding.');
    return { errors, raw };
  }
  function updateGateAction() {
    const approval = $('#gate-action').value === 'erc20-approval';
    $('#gate-to-label').textContent = approval ? 'APPROVAL SPENDER' : 'RECIPIENT';
    $('#gate-to').placeholder = approval ? 'Address allowed to spend tokens' : '0x…';
    $('#gate-token-row').hidden = !approval;
    $('#gate-amount-label').textContent = approval ? 'ALLOWANCE · TOKEN UNITS' : 'AMOUNT';
    $('#gate-amount').placeholder = approval ? 'e.g. 1.5' : '0.00';
    $('#gate-asset-display').innerHTML = approval ? '◈ <b>ERC-20</b> <small>Token</small>' : `◉ <b class="native-symbol">${currentNetwork().nativeSymbol}</b> <small>Native</small>`;
    $('#gate-preview').innerHTML = '';
    $('#gate-simulation-state').textContent = 'Run before signing';
  }
  $('#gate-action').addEventListener('change', updateGateAction);
  async function buildGatePlan(mode, spenderOrRecipient, amount, token) {
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    if (!Array.isArray(accounts) || !accounts.some(account => account.toLowerCase() === wallet.toLowerCase())) throw new Error('Connect the active OATH wallet in your browser wallet before preparing this action.');
    const chain = await ethereum.request({ method: 'eth_chainId' });
    if (parseInt(chain, 16) !== currentNetwork().chainId) {
      await walletChain();
      const switched = await ethereum.request({ method: 'eth_chainId' });
      if (parseInt(switched, 16) !== currentNetwork().chainId) throw new Error('Wallet network was not switched to the selected Pharos chain.');
    }
    if (mode === 'native') {
      const errors = evaluateTransfer(spenderOrRecipient, amount);
      if (errors.length) throw new Error(errors.join(' '));
      return { mode, tx: { from: wallet, to: spenderOrRecipient, value: `0x${amountToWei(amount).toString(16)}` }, details: { recipient: spenderOrRecipient, amount: `${amount} ${currentNetwork().nativeSymbol}` } };
    }
    if (!validAddress(token)) throw new Error('Token contract is not a valid 20-byte EVM address.');
    const code = await rpc('eth_getCode', [token, 'latest']);
    if (!code || code === '0x' || code === '0x0') throw new Error('Token address has no deployed contract bytecode on the selected network.');
    const decimalData = await rpc('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
    const decimals = Number(BigInt(decimalData));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Token decimals are invalid or exceed the supported safety limit (36).');
    const { errors, raw } = evaluateApproval(spenderOrRecipient, amount, decimals);
    if (errors.length) throw new Error(errors.join(' '));
    const word = value => BigInt(value).toString(16).padStart(64, '0');
    const allowanceData = `0xdd62ed3e${wallet.slice(2).toLowerCase().padStart(64, '0')}${spenderOrRecipient.slice(2).toLowerCase().padStart(64, '0')}`;
    const currentAllowance = BigInt(await rpc('eth_call', [{ to: token, data: allowanceData }, 'latest']));
    const approveData = `0x095ea7b3${spenderOrRecipient.slice(2).toLowerCase().padStart(64, '0')}${word(raw)}`;
    return {
      mode, token, decimals, raw, currentAllowance,
      tx: { from: wallet, to: token, value: '0x0', data: approveData },
      details: { spender: spenderOrRecipient, token, amount: `${formatTokenUnits(raw, decimals)} token units`, currentAllowance: `${formatTokenUnits(currentAllowance, decimals)} token units`, decimals }
    };
  }
  $('#preview-transfer').addEventListener('click', async () => {
    const mode = $('#gate-action').value, spenderOrRecipient = $('#gate-to').value.trim(), amount = $('#gate-amount').value.trim();
    const token = mode === 'erc20-approval' ? $('#gate-token').value.trim() : '';
    const previewNetwork = activeNetwork;
    const host = $('#gate-preview');
    if (!window.ethereum) { showToast('A browser wallet is required to sign.'); return; }
    host.innerHTML = '<div class="report-card"><div class="report-content"><h3>Decoding and simulating transaction…</h3></div></div>';
    $('#gate-simulation-state').textContent = 'Simulating with eth_call';
    try {
      const plan = await buildGatePlan(mode, spenderOrRecipient, amount, token);
      const [simulation, gas] = await Promise.all([rpc('eth_call', [plan.tx, 'latest']), rpc('eth_estimateGas', [plan.tx])]);
      if (typeof simulation !== 'string' || !simulation.startsWith('0x')) throw new Error('RPC returned an invalid simulation result.');
      if (mode === 'erc20-approval' && simulation.length >= 66 && BigInt(simulation) === 0n) throw new Error('Token simulation returned false; approval is blocked.');
      const gasCount = parseInt(gas, 16);
      if (!Number.isSafeInteger(gasCount) || gasCount <= 0) throw new Error('RPC returned an invalid gas estimate.');
      $('#gate-gas').textContent = `${gasCount.toLocaleString()} units`;
      $('#gate-simulation-state').textContent = 'Passed · latest state';
      const facts = mode === 'native'
        ? [['RECIPIENT', plan.details.recipient], ['AMOUNT', plan.details.amount], ['CALL DATA', 'Native value transfer']]
        : [['TOKEN CONTRACT', plan.details.token], ['SPENDER', plan.details.spender], ['APPROVAL', plan.details.amount], ['CURRENT ALLOWANCE', plan.details.currentAllowance], ['TOKEN DECIMALS', String(plan.details.decimals)], ['DECODED METHOD', 'approve(address,uint256)']];
      const factMarkup = facts.map(([label, value]) => `<div class="fact-box"><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join('');
      const simLength = simulation && simulation !== '0x' ? `${Math.max(0, (simulation.length - 2) / 2)} bytes of return data` : 'Call completed without revert';
      const approvalNote = mode === 'erc20-approval'
        ? 'OATH recognized approve(address,uint256), decoded the spender and allowance, read decimals and current allowance, and applied your local cap. Only this standard ERC-20 method is enabled; blanket operator approvals are not supported.'
        : 'Native value transfer only. The simulation uses current chain state but does not establish the recipient identity or safety.';
      host.innerHTML = `<div class="report-card"><div class="report-header"><b>Review decoded action</b><span class="classification caution">SIMULATION PASSED</span></div><div class="report-content"><div class="fact-grid">${factMarkup}<div class="fact-box"><small>NETWORK</small><b>${esc(currentNetwork().name)} · ${currentNetwork().chainId}</b></div><div class="fact-box"><small>SIMULATION</small><b>${esc(simLength)}</b></div><div class="fact-box"><small>ESTIMATED GAS</small><b>${gasCount.toLocaleString()} units</b></div></div><div class="report-warning">${esc(approvalNote)} Simulation is not a security guarantee; state may change before execution. Inspect the wallet prompt.</div><button class="button primary full-button" id="sign-transfer">Re-simulate and continue to wallet →</button></div></div>`;
      $('#sign-transfer').addEventListener('click', async () => {
        try {
          if (activeNetwork !== previewNetwork || $('#gate-action').value !== mode || $('#gate-to').value.trim() !== spenderOrRecipient || $('#gate-amount').value.trim() !== amount || (mode === 'erc20-approval' && $('#gate-token').value.trim() !== token)) throw new Error('Action details changed; run the preview again.');
          if (wallet.toLowerCase() !== plan.tx.from.toLowerCase()) throw new Error('Connected account changed; preview the action again.');
          const fresh = await buildGatePlan(mode, spenderOrRecipient, amount, token);
          if (JSON.stringify(fresh.tx) !== JSON.stringify(plan.tx)) throw new Error('Transaction details changed; preview the action again.');
          $('#gate-simulation-state').textContent = 'Re-simulating before wallet approval';
          const [freshSimulation, freshGas] = await Promise.all([rpc('eth_call', [fresh.tx, 'latest']), rpc('eth_estimateGas', [fresh.tx])]);
          if (typeof freshSimulation !== 'string' || !freshSimulation.startsWith('0x')) throw new Error('Latest-state simulation returned an invalid result.');
          if (mode === 'erc20-approval' && freshSimulation.length >= 66 && BigInt(freshSimulation) === 0n) throw new Error('Latest-state token simulation returned false; approval is blocked.');
          const freshGasCount = parseInt(freshGas, 16);
          if (!Number.isSafeInteger(freshGasCount) || freshGasCount <= 0) throw new Error('Latest-state gas estimation failed.');
          $('#gate-gas').textContent = `${freshGasCount.toLocaleString()} units`;
          const latest = await ethereum.request({ method: 'eth_chainId' });
          if (parseInt(latest, 16) !== currentNetwork().chainId) throw new Error('Wallet is on the wrong network.');
          const hash = await ethereum.request({ method: 'eth_sendTransaction', params: [fresh.tx] });
          host.insertAdjacentHTML('beforeend', `<div class="report-warning">Wallet submitted transaction: <a class="hash-row" href="${currentNetwork().explorer}/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">${esc(hash)}</a></div>`);
          addRecord({ title: mode === 'native' ? 'OATH Gate transfer submitted' : 'OATH Gate token approval submitted', target: hash, kind: 'gate', classification: 'UNKNOWN', network: activeNetwork });
          showToast('Transaction submitted by your wallet; checking receipt…');
          pollReceipt(hash, host);
        } catch (error) {
          $('#gate-simulation-state').textContent = 'Blocked · review required';
          showToast(error.code === 4001 ? 'Wallet signature was rejected.' : `Transaction blocked: ${error.message}`);
        }
      });
    } catch (error) {
      $('#gate-simulation-state').textContent = 'Simulation blocked';
      host.innerHTML = `<div class="report-warning"><b>POLICY OR SIMULATION BLOCKED</b><br>${esc(error.message)}</div>`;
    }
  });
  async function pollReceipt(hash,host){for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2500));try{const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt){const state=receipt.status==='0x1'?'successful':'failed';const note=document.createElement('div');note.className=receipt.status==='0x1'?'evidence-list':'report-warning';note.textContent=`Receipt observed: transaction ${state} in block ${parseInt(receipt.blockNumber,16)}.`;host.append(note);return}}catch{}}const note=document.createElement('div');note.className='report-warning';note.textContent='Receipt not available yet. Check the explorer link or run a transaction autopsy later.';host.append(note)}
  const APPROVAL_EVENT_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
  let watchBusy = false;
  function updateWatchUI(on) {
    $('#watch-label').textContent = on ? 'Active' : 'Paused';
    $('#watch-detail').textContent = on ? 'Monitoring chain activity' : 'Wallet watch is off';
    $('#wallet-monitoring').textContent = on ? 'Active' : 'Paused';
    $('#watch-status-chip').innerHTML = `<i></i> ${on ? 'ACTIVE' : 'PAUSED'}`;
    $('#start-watch').disabled = on;
    $('#stop-watch').disabled = !on;
  }
  function topicAddress(address) { return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`; }
  function notifyWatch(text) {
    if (!$('#watch-alert-check').checked || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification('OATH Watch · Pharos', { body: text, tag: `oath-${activeNetwork}-${Date.now()}` });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch { /* browser notification support is optional */ }
  }
  let discordConfigured = false;
  async function checkDiscordConfig() {
    try {
      const response = await fetch('/api/alerts');
      const data = await response.json();
      const enabled = response.ok && data.configured === true;
      discordConfigured = enabled;
      $('#watch-discord-check').disabled = !enabled;
      $('#test-discord-alert').disabled = !enabled;
      $('#watch-discord-status').textContent = enabled ? 'Webhook configured in deployment' : 'Add DISCORD_ALERTS_WEBHOOK_URL in Vercel';
      if (!enabled) $('#watch-discord-check').checked = false;
    } catch {
      discordConfigured = false;
      $('#watch-discord-check').disabled = true;
      $('#test-discord-alert').disabled = true;
      $('#watch-discord-status').textContent = 'Discord status unavailable';
    }
  }
  async function testDiscordAlert() {
    const address = $('#watch-address').value.trim() || wallet;
    if (!validAddress(address)) { showToast('Connect a wallet or enter a valid wallet address first.'); return; }
    const button = $('#test-discord-alert');
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ network: activeNetwork, wallet: address, events: [{ type: 'activity', message: 'Test alert from OATH Watch.' }] })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      showToast('Test alert delivered to Discord.');
      addWatchEvent('Discord test alert delivered.', new Date(), 'quiet');
    } catch (error) {
      showToast(`Discord test failed: ${error.message}`);
    } finally {
      button.textContent = 'Send test alert';
      button.disabled = !discordConfigured;
    }
  }
  async function sendDiscordAlerts(messages, address) {
    const events = messages.slice(0, 10).map(message => ({
      type: message.startsWith('ERC-20 Approval') ? 'approval' : message.startsWith('Monitored contract') ? 'contract' : /balance changed|Transaction count changed/i.test(message) ? 'wallet' : 'activity',
      message
    }));
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ network: activeNetwork, wallet: address, events })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        addWatchEvent('Discord delivery failed: ' + (result.error || ('HTTP ' + response.status)), new Date(), 'error');
      }
    } catch {
      addWatchEvent('Discord delivery failed: OATH could not reach its alert endpoint.', new Date(), 'error');
    }
  }
  async function watchTick() {
    if (watchBusy) return;
    watchBusy = true;
    const address = $('#watch-address').value.trim();
    const contract = $('#watch-contract-address').value.trim().toLowerCase();
    if (!validAddress(address)) { addWatchEvent('Enter a valid wallet address to monitor.', new Date(), 'error'); stopWatch(); watchBusy = false; return; }
    if (contract && !validAddress(contract)) { addWatchEvent('Optional contract address is invalid; correct it to resume event monitoring.', new Date(), 'error'); watchBusy = false; return; }
    try {
      const [bal, nonce, headHex] = await Promise.all([
        $('#watch-balance-check').checked ? rpc('eth_getBalance', [address, 'latest']) : Promise.resolve(null),
        $('#watch-nonce-check').checked ? rpc('eth_getTransactionCount', [address, 'latest']) : Promise.resolve(null),
        rpc('eth_blockNumber')
      ]);
      const head = parseInt(headHex, 16);
      if (!Number.isSafeInteger(head) || head < 0) throw new Error('RPC returned an invalid block height.');
      const previous = read('oath.watch.last', null);
      const sameWatch = previous && previous.network === activeNetwork && previous.address?.toLowerCase() === address.toLowerCase()
        && String(previous.contract || '') === contract && Number.isSafeInteger(Number(previous.lastBlock));
      const from = sameWatch ? Number(previous.lastBlock) + 1 : head;
      const to = Math.min(head, from + 199);
      let approvalLogs = [], contractLogs = [];
      if (from <= to && $('#watch-approval-check').checked) {
        approvalLogs = await rpc('eth_getLogs', [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [APPROVAL_EVENT_TOPIC, topicAddress(address)] }]);
      }
      if (from <= to && validAddress(contract)) {
        contractLogs = await rpc('eth_getLogs', [{ address: contract, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }]);
      }
      const checkpoint = from <= to ? to : Math.max(head, Number(previous?.lastBlock ?? head));
      const now = new Date();
      $('#watch-last-sync').textContent = `SYNCED ${now.toLocaleTimeString()} · block ${checkpoint.toLocaleString()}`;
      const events = [];
      if (sameWatch && bal !== null && previous.balance !== bal) events.push(`Native balance changed: ${(Number(BigInt(previous.balance)) / 1e18).toFixed(6)} → ${(Number(BigInt(bal)) / 1e18).toFixed(6)} ${currentNetwork().nativeSymbol}`);
      if (sameWatch && nonce !== null && previous.nonce !== nonce) events.push(`Transaction count changed: ${parseInt(previous.nonce, 16)} → ${parseInt(nonce, 16)}`);
      for (const log of approvalLogs) {
        if (!log.topics || log.topics.length < 3 || log.topics[0]?.toLowerCase() !== APPROVAL_EVENT_TOPIC || log.topics[1]?.toLowerCase() !== topicAddress(address).toLowerCase() || !/^0x[0-9a-fA-F]{64}$/.test(log.data || '')) continue;
        const spender = `0x${log.topics[2].slice(-40)}`;
        const rawAllowance = BigInt(log.data).toString();
        events.push(`ERC-20 Approval event · token ${short(log.address)} · spender ${short(spender)} · ${rawAllowance} raw units · tx ${short(log.transactionHash)}`);
      }
      for (const log of contractLogs) {
        if (log.address?.toLowerCase() !== contract) continue;
        events.push(`Monitored contract event · ${short(contract)} · topic ${(log.topics || [])[0] || 'unknown'} · tx ${short(log.transactionHash)}`);
      }
      const alertEvents = events.slice(0, 10);
      alertEvents.forEach(text => { addWatchEvent(text, now); notifyWatch(text); });
      if (alertEvents.length && $('#watch-discord-check').checked) void sendDiscordAlerts(alertEvents, address);
      if (!sameWatch) addWatchEvent(`Monitoring baseline set for ${currentNetwork().name} · ${short(address)} · from block ${head.toLocaleString()}`, now, 'quiet');
      else if (!events.length) addWatchEvent(`Sync completed · scanned through block ${checkpoint.toLocaleString()}`, now, 'quiet');
      save('oath.watch.last', { address, contract, network: activeNetwork, balance: bal, nonce, lastBlock: checkpoint });
    } catch (error) {
      addWatchEvent(`RPC log scan failed: ${error.message}`, new Date(), 'error');
    } finally { watchBusy = false; }
  }
  function addWatchEvent(text, date, kind = 'change') {
    const host = $('#watch-events');
    if (host.querySelector('.empty-row')) host.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'watch-event';
    row.innerHTML = `<i style="background:${kind === 'error' ? '#da7777' : kind === 'quiet' ? '#6481ab' : '#73d9a8'}"></i><span><b>${esc(text)}</b><small>${date.toLocaleString()}</small></span>`;
    host.prepend(row);
    while (host.children.length > 60) host.lastElementChild.remove();
  }
  function stopWatch() { clearInterval(watchTimer); watchTimer = null; updateWatchUI(false); }
  $('#start-watch').addEventListener('click', async () => {
    const address = $('#watch-address').value.trim() || wallet;
    const contract = $('#watch-contract-address').value.trim();
    if (!validAddress(address)) { showToast('Connect a wallet or enter a valid EVM address.'); return; }
    if (contract && !validAddress(contract)) { showToast('Enter a valid contract address or leave it blank.'); return; }
    $('#watch-address').value = address;
    localStorage.setItem('oath.watch.config', JSON.stringify({
      address, contract, balance: $('#watch-balance-check').checked, nonce: $('#watch-nonce-check').checked,
      approvals: $('#watch-approval-check').checked, alerts: $('#watch-alert-check').checked, discord: $('#watch-discord-check').checked
    }));
    if ($('#watch-alert-check').checked && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* keep in-app monitoring available */ }
    }
    if ($('#watch-alert-check').checked && (!('Notification' in window) || Notification.permission !== 'granted')) showToast('Monitoring will run; allow browser notifications for desktop alerts.');
    updateWatchUI(true);
    watchTick();
    watchTimer = setInterval(watchTick, 20000);
  });
  $('#stop-watch').addEventListener('click', stopWatch);
  $('#test-discord-alert').addEventListener('click', testDiscordAlert);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && watchTimer) watchTick(); });
  void checkDiscordConfig();
  const watchConfig = read('oath.watch.config', null);
  if (watchConfig) {
    $('#watch-address').value = watchConfig.address || '';
    $('#watch-contract-address').value = watchConfig.contract || '';
    $('#watch-balance-check').checked = watchConfig.balance !== false;
    $('#watch-nonce-check').checked = watchConfig.nonce !== false;
    $('#watch-approval-check').checked = watchConfig.approvals !== false;
    $('#watch-alert-check').checked = watchConfig.alerts !== false;
    $('#watch-discord-check').checked = watchConfig.discord === true;
  }
  let pendingPayment = null, lastReportHash = '';
  async function checkMarketStatus() {
    try {
      const response = await fetch(`/api/market?network=${activeNetwork}`);
      const data = await response.json();
      $('#market-network').textContent = data.network || currentNetwork().name;
      $('#market-facilitator').textContent = data.facilitator || 'Not configured';
      $('#market-scheme').textContent = data.scheme === 'pharos-native-transfer' ? 'Native PHRS · x402 v2' : data.scheme === 'exact' ? 'Exact EVM · x402 v2' : 'Unavailable';
      $('#market-asset').textContent = data.asset === 'native:PHRS' ? 'PHRS (native)' : data.asset || 'Not configured';
      $('#market-recipient').textContent = data.recipient || 'Not configured';
      const ready = data.status === 'ready';
      $('#request-market').disabled = !ready;
      $('#market-status-chip').className = `tiny-chip ${ready ? '' : 'warn'}`;
      $('#market-status-chip').innerHTML = `<i></i> ${ready ? 'READY' : 'UNAVAILABLE'}`;
      $('#market-delivery-status').textContent = ready ? 'READY FOR REQUEST' : 'NOT AVAILABLE';
      $('#market-terms').dataset.reason = data.reason || '';
    } catch {
      $('#market-status-chip').innerHTML = '<i></i> STATUS UNAVAILABLE';
      $('#request-market').disabled = true;
    }
  }
  $('#check-market').addEventListener('click', checkMarketStatus);
  function decodeBase64Json(value) {
    try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)))); } catch { return null; }
  }
  function encodeBase64Json(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }
  async function sendPaidRequest(paymentSignature) {
    const query = $('#market-query').value.trim();
    const response = await fetch('/api/market', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(paymentSignature ? { 'payment-signature': paymentSignature } : {}) },
      body: JSON.stringify({ network: activeNetwork, query, source: activeSource })
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty error response */ }
    return { response, data };
  }
  function showPaidReport(response, data) {
    $('#market-delivery-status').textContent = 'DELIVERED';
    const payment = data.payment || {};
    const receipt = payment.txHash && /^0x[a-fA-F0-9]{64}$/.test(payment.txHash)
      ? `<div class="fact-box"><small>SETTLED TRANSACTION</small><b><a href="${currentNetwork().explorer}/tx/${payment.txHash}" target="_blank" rel="noopener noreferrer">${esc(short(payment.txHash, 12, 10))} · View on Pharos Explorer ↗</a></b></div>`
      : `<div class="fact-box"><small>PAYMENT RESULT</small><b>${esc(response.headers.get('payment-response') || payment.receipt || 'Facilitator confirmed settlement')}</b></div>`;
    $('#market-output').innerHTML = `<div class="result-card"><div class="report-header"><b>Paid report delivered</b><span class="classification verified">SETTLED</span></div><div class="report-content"><pre class="hash-row">${esc(JSON.stringify(data.report || data, null, 2))}</pre>${receipt}<div class="report-warning">The report was delivered after payment verification and settlement.</div></div></div>`;
    pendingPayment = null;
    addRecord({ title: 'x402 paid investigation', kind: 'payment', network: activeNetwork, classification: 'VERIFIED' });
  }
  $('#request-market').addEventListener('click', async () => {
    const query = $('#market-query').value.trim();
    if (!query) { showToast('Write the investigation request first.'); return; }
    $('#market-delivery-status').textContent = 'REQUESTING';
    $('#market-output').innerHTML = '<div class="empty-row">Requesting the paid service endpoint…</div>';
    try {
      const { response, data } = await sendPaidRequest();
      if (response.status === 402) {
        const challenge = decodeBase64Json(response.headers.get('payment-required') || response.headers.get('PAYMENT-REQUIRED') || '') || data;
        pendingPayment = challenge;
        const match = (challenge.accepts || []).find(item => item.network === `eip155:${NETWORKS[activeNetwork].chainId}`
          && ['exact', 'pharos-native-transfer'].includes(item.scheme));
        if (!match) throw new Error('The payment challenge does not offer a supported scheme for the selected Pharos network.');
        const native = match.scheme === 'pharos-native-transfer';
        const displayAmount = match.amountFormatted || match.amount;
        const paymentInstructions = native
          ? 'Your wallet will submit a native PHRS transfer on Atlantic Testnet. Review the exact amount and recipient in the wallet before approving.'
          : 'Your wallet will request a typed-data signature authorizing one token transfer.';
        $('#market-delivery-status').textContent = 'PAYMENT REQUIRED';
        $('#market-output').innerHTML = `<div class="result-card"><div class="report-content"><h3>Payment challenge received</h3><p class="muted">No payment has been submitted yet. Review the payment details before approving in your wallet.</p><div class="fact-grid"><div class="fact-box"><small>NETWORK</small><b>${esc(match.network)}</b></div><div class="fact-box"><small>ASSET</small><b>${esc(native ? 'PHRS (native)' : match.asset)}</b></div><div class="fact-box"><small>AMOUNT</small><b>${esc(displayAmount)}</b></div><div class="fact-box"><small>RECIPIENT</small><b>${esc(match.payTo)}</b></div><div class="fact-box"><small>PAYMENT METHOD</small><b>${native ? 'Wallet transaction' : 'EIP-3009 authorization'}</b></div></div><div class="report-warning">${esc(paymentInstructions)} A blockchain transfer cannot be reversed once confirmed.</div><button class="button primary full-button" id="authorize-x402">${native ? 'Review and send PHRS payment →' : 'Review and sign payment →'}</button></div></div>`;
        $('#authorize-x402').addEventListener('click', authorizePaidRequest);
        return;
      }
      if (!response.ok) throw new Error(data.error || `Service returned HTTP ${response.status}.`);
      showPaidReport(response, data);
    } catch (error) {
      $('#market-delivery-status').textContent = 'UNAVAILABLE';
      $('#market-output').innerHTML = `<div class="report-warning">${esc(error.message)}</div>`;
    }
  });
  async function authorizePaidRequest() {
    try {
      if (!pendingPayment) throw new Error('Payment challenge is no longer available. Request it again.');
      if (!wallet) throw new Error('Connect your wallet first.');
      const requirement = (pendingPayment.accepts || []).find(item => item.network === `eip155:${NETWORKS[activeNetwork].chainId}`
        && ['exact', 'pharos-native-transfer'].includes(item.scheme));
      if (!requirement) throw new Error('No supported payment requirement matches the selected network.');
      await walletChain();
      const activeChain = await ethereum.request({ method: 'eth_chainId' });
      if (parseInt(activeChain, 16) !== currentNetwork().chainId) throw new Error('Wallet network does not match the payment network.');

      if (requirement.scheme === 'pharos-native-transfer') {
        if (activeNetwork !== 'atlantic' || Number(requirement.extra?.chainId) !== 688689) throw new Error('Native PHRS payments are available only on Atlantic Testnet.');
        if (!/^0x[a-fA-F0-9]{40}$/.test(requirement.payTo || '') || !/^\d+$/.test(requirement.amount || '') || BigInt(requirement.amount) <= 0n) throw new Error('The facilitator returned an invalid recipient or amount.');
        $('#market-delivery-status').textContent = 'WALLET APPROVAL';
        const txHash = await ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: wallet, to: requirement.payTo, value: `0x${BigInt(requirement.amount).toString(16)}` }]
        });
        $('#market-delivery-status').textContent = 'WAITING FOR ATLANTIC CONFIRMATION';
        $('#market-output').innerHTML = `<div class="empty-row">Payment submitted: ${esc(short(txHash))}. Waiting for Atlantic Testnet confirmation…</div>`;
        const receipt = await waitForReceipt(txHash, 48);
        if (!receipt || receipt.status !== '0x1') throw new Error('Payment transaction was not confirmed successful. Check its status in your wallet or Pharos Explorer.');
        const proof = encodeBase64Json({
          x402Version: 2,
          scheme: 'pharos-native-transfer',
          network: 'eip155:688689',
          payload: { txHash, payer: wallet }
        });
        $('#market-delivery-status').textContent = 'FACILITATOR VERIFYING';
        $('#market-output').innerHTML = '<div class="empty-row">Atlantic confirmed the transfer. The facilitator is verifying settlement before OATH delivers the report…</div>';
        const { response, data } = await sendPaidRequest(proof);
        if (!response.ok) throw new Error(data.error || `Facilitator did not verify settlement (HTTP ${response.status}). Payment transaction: ${short(txHash)}.`);
        showPaidReport(response, data);
        return;
      }

      if (requirement.extra?.assetTransferMethod && requirement.extra.assetTransferMethod !== 'eip3009') throw new Error('This wallet flow supports only EIP-3009 exact token authorization.');
      if (!requirement.extra?.name || !requirement.extra?.version) throw new Error('The challenge omitted the token EIP-712 name/version needed for a verifiable signature.');
      const code = await rpc('eth_getCode', [requirement.asset, 'latest']);
      if (code === '0x' || code === '0x0') throw new Error('Payment asset has no deployed bytecode on the selected network.');
      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from: wallet, to: requirement.payTo, value: String(requirement.amount),
        validAfter: String(Math.max(0, now - 10)),
        validBefore: String(now + Math.min(Number(requirement.maxTimeoutSeconds || 300), 300)),
        nonce: '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      };
      const typed = {
        domain: { name: requirement.extra.name, version: requirement.extra.version, chainId: currentNetwork().chainId, verifyingContract: requirement.asset },
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
          TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }]
        },
        primaryType: 'TransferWithAuthorization', message: authorization
      };
      const signature = await ethereum.request({ method: 'eth_signTypedData_v4', params: [wallet, JSON.stringify(typed)] });
      const payment = {
        x402Version: 2,
        resource: pendingPayment.resource || { url: location.origin + '/api/market', description: 'OATH Premium Intelligence', mimeType: 'application/json' },
        accepted: requirement,
        payload: { signature, authorization }
      };
      const { response, data } = await sendPaidRequest(encodeBase64Json(payment));
      if (!response.ok) throw new Error(data.error || `Payment service returned HTTP ${response.status}.`);
      showPaidReport(response, data);
    } catch (error) {
      $('#market-delivery-status').textContent = 'PAYMENT NOT VERIFIED';
      $('#market-output').innerHTML = `<div class="report-warning">${esc(error.message)} No paid report was marked as delivered.</div>`;
    }
  }
  async function registryConfig(){const [r,local]=await Promise.all([fetch('/api/config').then(x=>x.json()).catch(()=>({})),Promise.resolve(read('oath.registry.addresses',{}))]);return local[activeNetwork]||r.registryAddresses?.[activeNetwork]||''}
  async function updateRegistryStatus(){try{$('#registry-network').textContent=currentNetwork().name;$('#registry-wallet-state').textContent=wallet?short(wallet,8,6):'Not connected';const address=await registryConfig();$('#registry-address').value=address;$('#registry-current-address').textContent=address?short(address,9,7):'Not configured';if(address){const code=await rpc('eth_getCode',[address,'latest']);const exists=code!=='0x'&&code!=='0x0';$('#registry-status-chip').className=`tiny-chip ${exists?'':'warn'}`;$('#registry-status-chip').innerHTML=`<i></i> ${exists?'AVAILABLE':'NO CODE'}`;$('#registry-deployment-state').textContent=exists?'Deployed on selected network':'Address has no code';$('#register-report').disabled=!exists}else{$('#registry-status-chip').className='tiny-chip warn';$('#registry-status-chip').innerHTML='<i></i> NOT DEPLOYED';$('#registry-deployment-state').textContent='Deploy or configure a registry address';$('#register-report').disabled=true}}catch(e){$('#registry-deployment-state').textContent=e.message}}
  $('#hash-report').addEventListener('click',async()=>{const value=$('#registry-report').value;if(!value.trim()){showToast('Enter report content first.');return}const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));lastReportHash='0x'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');$('#registry-hash-output').textContent=`SHA-256 ${lastReportHash}`;$('#registry-verify-hash').value=lastReportHash;await updateRegistryStatus()});
  $('#registry-address').addEventListener('change',()=>{const addresses=read('oath.registry.addresses',{});addresses[activeNetwork]=$('#registry-address').value.trim();save('oath.registry.addresses',addresses);updateRegistryStatus()});
  $('#deploy-registry').addEventListener('click',async()=>{if(!wallet){showToast('Connect a wallet to deploy.');return}try{let artifactResponse=await fetch('/oath-registry-artifact.json');if(!artifactResponse.ok)throw new Error('Registry bytecode artifact is not built yet. Run npm run compile:registry.');const artifact=await artifactResponse.json();await walletChain();if(parseInt(await ethereum.request({method:'eth_chainId'}),16)!==currentNetwork().chainId)throw new Error('Wallet is on the wrong network.');$('#registry-deployment-state').textContent='Waiting for wallet approval';const hash=await ethereum.request({method:'eth_sendTransaction',params:[{from:wallet,data:artifact.bytecode}]});$('#registry-deployment-state').textContent=`Deployment sent · ${short(hash)}`;const receipt=await waitForReceipt(hash,40);if(!receipt?.contractAddress)throw new Error('No deployment address in the confirmed transaction receipt.');const addresses=read('oath.registry.addresses',{});addresses[activeNetwork]=receipt.contractAddress;save('oath.registry.addresses',addresses);$('#registry-address').value=receipt.contractAddress;$('#registry-deployment-state').textContent=`Deployed · ${short(receipt.contractAddress)}`;showToast('OATH Registry deployment confirmed.');await updateRegistryStatus()}catch(e){$('#registry-deployment-state').textContent='Deployment incomplete';showToast(e.code===4001?'Registry deployment was rejected in the wallet.':e.message)}});
  async function waitForReceipt(hash,attempts=20){for(let i=0;i<attempts;i++){const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt)return receipt;await new Promise(r=>setTimeout(r,2500))}return null}
  $('#register-report').addEventListener('click',async()=>{const hash=$('#registry-verify-hash').value.trim(),address=$('#registry-address').value.trim();if(!/^0x[a-fA-F0-9]{64}$/.test(hash)||!validAddress(address)){showToast('Calculate a SHA-256 report hash and configure the deployed registry first.');return}if(!wallet){showToast('Connect a wallet to register the report.');return}try{const encoded=await fetch('/api/registry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'encode',network:activeNetwork,registry:address,hash,source:activeSource})}).then(r=>r.json());if(encoded.error)throw new Error(encoded.error);await walletChain();const result=await ethereum.request({method:'eth_sendTransaction',params:[{from:wallet,to:encoded.to,data:encoded.data}]});$('#registry-deployment-state').textContent=`Anchor submitted · ${short(result)}`;const receipt=await waitForReceipt(result,30);if(!receipt||receipt.status!=='0x1')throw new Error('Report-anchor receipt was not confirmed successful.');$('#registry-deployment-state').textContent=`Report hash anchored · block ${parseInt(receipt.blockNumber,16)}`;addRecord({title:'Report hash anchored',target:hash,kind:'registry',network:activeNetwork,classification:'VERIFIED'});showToast('Report hash anchor confirmed on-chain.')}catch(e){showToast(e.code===4001?'Anchor transaction was rejected.':e.message)}});
  $('#verify-report').addEventListener('click',async()=>{const hash=$('#registry-verify-hash').value.trim(),address=$('#registry-address').value.trim();if(!/^0x[a-fA-F0-9]{64}$/.test(hash)){showToast('Enter a 32-byte report hash.');return}try{const r=await fetch('/api/registry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'verify',network:activeNetwork,registry:address||undefined,hash,source:activeSource})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Registry query failed.');$('#registry-deployment-state').textContent=data.exists?`Verified · reporter ${short(data.reporter)} · ${new Date(data.timestamp*1000).toLocaleString()}`:'Hash has not been registered';$('#registry-current-address').textContent=short(data.registry);showToast(data.exists?'On-chain hash match found.':'No on-chain record for this hash.')}catch(e){showToast(e.message)}});
  $('#registry-verify-hash').addEventListener('input',()=>$('#register-report').disabled=true);
  $$('.nav-item').forEach(()=>{});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
  loadPolicyForm();renderWallet();updateCounts();renderRecent();updateNetworkUI();networkCheck();refreshIntegrationStatus();checkMarketStatus();updateRegistryStatus();
  const landingStatusObserver=new MutationObserver(()=>{const state=$('#network-state').textContent;const target=$('#landing-network-status');target.textContent=state.includes('block')?`${currentNetwork().name} · ${state}`:state==='Checking…'?'Checking Pharos network…':`${currentNetwork().name} · ${state}`});landingStatusObserver.observe($('#network-state'),{childList:true,subtree:true,characterData:true});
})();

