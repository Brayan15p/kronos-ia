// KRONOS Monte Carlo — Web Worker
// Corre en hilo separado: la UI nunca se congela.
// Todas las constantes son module-level: cero allocations dentro del hot loop.

// ─── Constantes normalInv (Beasley-Springer-Moro) ── module level, sin GC ───
const NI_A0 =  2.50662823884,  NI_A1 = -18.61500062529,
      NI_A2 = 41.39119773534,  NI_A3 = -25.44106049637;
const NI_B0 = -8.47351093090,  NI_B1 =  23.08336743743,
      NI_B2 = -21.06224101826, NI_B3 =   3.13082909833;
const NI_C0 = 0.3374754822726147, NI_C1 = 0.9761690190917186,
      NI_C2 = 0.1607979714918209, NI_C3 = 0.0276438810333863,
      NI_C4 = 0.0038405729373609, NI_C5 = 0.0003951896511349,
      NI_C6 = 0.0000321767881768, NI_C7 = 0.0000002888167364,
      NI_C8 = 0.0000003960315187;

function normalInv(p: number): number {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const x = p - 0.5;
  if (Math.abs(x) < 0.42) {
    const r = x * x;
    return x * (((NI_A3*r+NI_A2)*r+NI_A1)*r+NI_A0)
             / ((((NI_B3*r+NI_B2)*r+NI_B1)*r+NI_B0)*r+1);
  }
  const r = Math.log(-Math.log(p < 0.5 ? p : 1 - p));
  const y = NI_C0+r*(NI_C1+r*(NI_C2+r*(NI_C3+r*(NI_C4+r*(NI_C5+r*(NI_C6+r*(NI_C7+r*NI_C8)))))));
  return p < 0.5 ? -y : y;
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p = d*t*(0.31938153+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z > 0 ? 1 - p : p;
}

// LHS usando Float64Array — más rápido que Array normal, sin GC
function lhsSample(N: number): Float64Array {
  const u = new Float64Array(N);
  for (let i = 0; i < N; i++) u[i] = (i + Math.random()) / N;
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = u[i]; u[i] = u[j]; u[j] = tmp;
  }
  return u;
}

function antitheticLHS(N: number): Float64Array {
  const half = Math.ceil(N / 2);
  const base = lhsSample(half);
  const out = new Float64Array(N);
  for (let i = 0; i < half; i++) {
    out[i * 2]     = base[i];
    if (i * 2 + 1 < N) out[i * 2 + 1] = 1 - base[i];
  }
  return out;
}

function pertSample(u: number, a: number, m: number, b: number): number {
  if (b <= a) return m;
  const mu = (a + 4 * m + b) / 6;
  const alpha = 6 * (mu - a) / Math.max(1e-9, b - a);
  const beta  = 6 * (b - mu) / Math.max(1e-9, b - a);
  const za = normalInv(u);
  const xn = alpha / (alpha + beta) +
    Math.sqrt((alpha * beta) / Math.max(1e-9, (alpha+beta)**2 * (alpha+beta+1))) * za;
  return a + Math.max(0, Math.min(1, xn)) * (b - a);
}

function andersonDarling(sorted: Float64Array | number[], cdf: (x: number) => number): number {
  const N = sorted.length; if (N < 4) return 999;
  let S = 0;
  for (let i = 0; i < N; i++) {
    const fi  = Math.min(1-1e-10, Math.max(1e-10, cdf(sorted[i])));
    const fni = Math.min(1-1e-10, Math.max(1e-10, cdf(sorted[N-1-i])));
    S += (2*i+1) * (Math.log(fi) + Math.log(1-fni));
  }
  return -N - S / N;
}

function adNormal(s: number[], mean: number, std: number) {
  if (std <= 0) return 999;
  return andersonDarling(s, x => normalCDF((x-mean)/std));
}
function adLogNormal(s: number[]) {
  const xs = s.filter(x => x > 0); if (xs.length < 4) return 999;
  const logs = xs.map(x => Math.log(x));
  const mu = logs.reduce((a,b)=>a+b,0)/xs.length;
  const sd = Math.sqrt(logs.reduce((s,l)=>s+(l-mu)**2,0)/Math.max(1,xs.length-1));
  if (sd <= 0) return 999;
  return andersonDarling(xs, x => x<=0?0:normalCDF((Math.log(x)-mu)/sd));
}
function adTriangular(s: number[], mean: number) {
  const a=s[0],b=s[s.length-1]; if (b<=a) return 999;
  const c = Math.max(a+1e-9, Math.min(b-1e-9, 3*mean-a-b));
  return andersonDarling(s, x=>{
    if(x<=a)return 0;if(x>=b)return 1;
    if(x<c)return(x-a)**2/((b-a)*(c-a));
    return 1-(b-x)**2/((b-a)*(b-c));
  });
}
function adPert(s: number[], mean: number, std: number) {
  const a=s[0],b=s[s.length-1]; if (b<=a||s.length<4) return 999;
  const alpha=6*(mean-a)/Math.max(1e-9,b-a),beta=6*(b-mean)/Math.max(1e-9,b-a);
  const mu2=alpha/(alpha+beta), sig=Math.sqrt(alpha*beta/Math.max(1e-9,(alpha+beta)**2*(alpha+beta+1)));
  return andersonDarling(s, x=>{
    const t=(x-a)/Math.max(1e-9,b-a);
    if(t<=0)return 0;if(t>=1)return 1;
    return normalCDF((t-mu2)/Math.max(sig,1e-9));
  });
}

function percentileCI(sorted: Float64Array, p: number): [number, number] {
  const N = sorted.length; if (N < 4) return [sorted[0], sorted[N-1]];
  const mu = N*p, sigma = Math.sqrt(N*p*(1-p));
  const lo = Math.max(0, Math.floor(mu-1.96*sigma));
  const hi = Math.min(N-1, Math.ceil(mu+1.96*sigma));
  return [sorted[lo], sorted[hi]];
}

function sobolFirstOrder(
  base: number[],
  factors: { name: string; perturb: (f: number) => number[] }[]
): { name: string; si: number; si_pct: number }[] {
  const N = base.length;
  const meanY = base.reduce((a,b)=>a+b,0)/N;
  const varY  = base.reduce((s,x)=>s+(x-meanY)**2,0)/N;
  if (varY < 1e-12) return factors.map(f=>({name:f.name,si:0,si_pct:0}));
  return factors.map(f=>{
    const p = f.perturb(0.1);
    const condMean = p.reduce((a,b)=>a+b,0)/N;
    const condVar  = p.reduce((s,x)=>s+(x-condMean)**2,0)/N;
    const si = Math.max(0, Math.min(1,(varY-condVar)/varY));
    return { name: f.name, si, si_pct: si*100 };
  }).sort((a,b)=>b.si-a.si);
}

// ─── Mensaje recibido del componente ─────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const {
    simCount, dist, effMean, effStd, target,
    tMin, tMax, meanShift, times,
    avgHourlyCost, qty, price, baseMean, baseStd,
  } = e.data as {
    simCount: number; dist: string; effMean: number; effStd: number;
    target: number; tMin: number; tMax: number; meanShift: number;
    times: number[]; avgHourlyCost: number; qty: number; price: number;
    baseMean: number; baseStd: number;
  };

  // Muestreo LHS + Antithetic en Float64Array
  const uniforms = antitheticLHS(simCount);
  const scenarios = new Float64Array(simCount);

  let runningSum = 0;
  let runningM2  = 0;
  let runningMean= 0;

  const convergence: {n:number;mean:number;p95:number}[] = [];
  const cpRaw = [100,250,500,1000,2000,3500,5000,7500,10000,20000,35000,50000]
    .filter(c => c <= simCount);
  const checkpoints = Array.from(new Set([...cpRaw, simCount])).sort((a,b)=>a-b);
  const cpSet = new Set(checkpoints);

  // ── Loop principal — cero allocations ────────────────────────────────────
  for (let i = 0; i < simCount; i++) {
    const u = uniforms[i];
    let v: number;
    if (dist === "normal") {
      v = Math.max(0, effMean + effStd * normalInv(u));
    } else if (dist === "lognormal") {
      const cv = effMean > 0 ? effStd/effMean : 0.1;
      const s2 = Math.log(1+cv*cv);
      const mu = Math.log(Math.max(effMean,1e-9)) - s2/2;
      v = Math.exp(mu + Math.sqrt(s2) * normalInv(u));
    } else if (dist === "triangular") {
      const a = Math.max(0, effMean-2.5*effStd);
      const b = effMean+2.5*effStd;
      const c = effMean;
      const fc = b>a?(c-a)/(b-a):0.5;
      v = u<fc
        ? a + Math.sqrt(u*(b-a)*Math.max(0,c-a))
        : b - Math.sqrt((1-u)*(b-a)*Math.max(0,b-c));
    } else if (dist === "pert") {
      const a = Math.max(0, tMin*(1+meanShift/100));
      const b = tMax*(1+meanShift/100);
      const m = Math.max(a, Math.min(b, effMean));
      v = pertSample(u, a, m, b);
    } else {
      // bootstrap
      const idx = Math.floor(u * times.length);
      const real = times[Math.min(idx, times.length-1)];
      v = Math.max(0, real*(1+meanShift/100) + effStd*0.12*normalInv(Math.random()||1e-9));
    }
    v = Math.max(0, v);
    scenarios[i] = v;
    runningSum += v;
    // Welford online variance
    const count = i + 1;
    const delta  = v - runningMean;
    runningMean += delta / count;
    runningM2   += delta * (v - runningMean);

    if (cpSet.has(count)) {
      const runStd = count > 1 ? Math.sqrt(runningM2/(count-1)) : 0;
      convergence.push({ n: count, mean: runningMean, p95: runningMean + 1.645*runStd });
      // Progreso
      self.postMessage({ type: "progress", pct: Math.round(count/simCount*80) });
    }
  }

  self.postMessage({ type: "progress", pct: 85 });

  // ── Estadísticas post-loop ────────────────────────────────────────────────
  scenarios.sort(); // sort nativo de Float64Array — muy rápido
  const N = simCount;

  const pct = (p: number) => scenarios[Math.min(N-1, Math.floor(N*p))];
  const p5=pct(0.05),p10=pct(0.1),p50=pct(0.5),p90=pct(0.9),p95=pct(0.95);

  const simMean = runningMean;
  const simVar  = runningM2 / Math.max(1, N-1);  // Welford — sin re-reduce
  const simStd  = Math.sqrt(simVar);
  const cv      = simMean > 0 ? simStd/simMean : 0;

  // Contar cumplimiento con binary search en Float64Array
  let lo=0,hi=N;
  while(lo<hi){const mid=(lo+hi)>>1;scenarios[mid]<=target?lo=mid+1:hi=mid;}
  const probMeetTarget = lo/N;

  const se = simStd/Math.sqrt(N);
  const ciLow=simMean-1.96*se,ciHigh=simMean+1.96*se;

  // Capacidad
  const denomStd=effStd>0?effStd:1e-9;
  const cpk=(target-simMean)/(3*denomStd);
  const cp=target/(6*denomStd);
  const tau=Math.sqrt(simVar+(simMean-target)**2);
  const cpm=target/(6*Math.max(tau,1e-9));
  const sigmaLevel=(target-simMean)/denomStd;
  const sigmaSix=Math.max(0,Math.min(6,sigmaLevel+1.5));
  const dpmoTheoretical=Math.round(Math.min(1e6,Math.max(0,(1-normalCDF(sigmaSix-1.5))*1e6)));
  const dpmo=Math.round((1-probMeetTarget)*1e6);

  const σ_real=baseStd>0?baseStd:1e-9;
  const ppu=(target-baseMean)/(3*σ_real);
  const ppk=ppu;
  const pp=target/(6*σ_real);
  const cpk_vs_ppk_ratio=ppk>0?cpk/ppk:1;

  const tStat=(simMean-target)/(simStd/Math.sqrt(N));
  const pValue=Math.max(0,Math.min(1,normalCDF(tStat)));
  const rejectH0=pValue<0.05;

  const p5ci=percentileCI(scenarios,0.05);
  const p95ci=percentileCI(scenarios,0.95);

  self.postMessage({ type: "progress", pct: 88 });

  // AD en subsample
  const adStep=Math.max(1,Math.floor(N/2000));
  const adSample: number[]=[];
  for(let i=0;i<N;i+=adStep) adSample.push(scenarios[i]);
  const adScores={
    normal:     adNormal(adSample,simMean,simStd),
    lognormal:  adLogNormal(adSample),
    triangular: adTriangular(adSample,simMean),
    pert:       adPert(adSample,simMean,simStd),
  };

  self.postMessage({ type: "progress", pct: 92 });

  // Sobol en subsample
  const sobolStep=Math.max(1,Math.floor(N/3000));
  const ss: number[]=[];
  for(let i=0;i<N;i+=sobolStep) ss.push(scenarios[i]);
  const c2=avgHourlyCost/3600;
  const sobolBase=ss.map(t=>qty*(price-t*c2));
  const sobol=sobolFirstOrder(sobolBase,[
    {name:"Tiempo ciclo",    perturb:f=>ss.map(t=>qty*(price-t*(1+f)*c2))},
    {name:"Valor producto",  perturb:f=>ss.map(t=>qty*(price*(1+f)-t*c2))},
    {name:"Volumen mensual", perturb:f=>ss.map(t=>qty*(1+f)*(price-t*c2))},
    {name:"Costo M.O.",      perturb:f=>ss.map(t=>qty*(price-t*(avgHourlyCost*(1+f))/3600))},
  ]);

  self.postMessage({ type: "progress", pct: 95 });

  // Financiero
  const costPerSecond=avgHourlyCost/3600;
  const profit=(t:number)=>qty*(price-t*costPerSecond);
  const expected=profit(simMean),best=profit(p5),worst=profit(p95);
  const annualExpected=expected*12;
  const var95=expected-worst;
  const tailStart=Math.floor(0.95*N);
  let tailSum=0;
  for(let i=tailStart;i<N;i++) tailSum+=profit(scenarios[i]);
  const tailMean=tailSum/(N-tailStart||1);
  const cvar=expected-tailMean;
  const costSaved=(simMean-p5)*costPerSecond*qty;
  const costLost=(p95-simMean)*costPerSecond*qty;
  const baselineExpected=profit(baseMean);
  const improvementMonthly=expected-baselineExpected;
  const improvementAnnual=improvementMonthly*12;
  const improvementPct=Math.abs(baselineExpected)>0?(improvementMonthly/Math.abs(baselineExpected))*100:0;

  // Histograma
  const binCount=32;
  const minT=scenarios[0],maxT=scenarios[N-1];
  const binWidth=(maxT-minT)/binCount||1;
  const histogram=[];
  let cursor=0;
  for(let i=0;i<binCount;i++){
    const lo2=minT+i*binWidth,hi2=lo2+binWidth;
    let count=0;
    while(cursor<N){
      const inBin=i===binCount-1?scenarios[cursor]<=hi2:scenarios[cursor]<hi2;
      if(inBin){count++;cursor++;}else break;
    }
    histogram.push({bin:(lo2+binWidth/2).toFixed(0),mid:lo2+binWidth/2,count,meets:lo2+binWidth/2<=target});
  }

  // CDF
  const cdf=[];
  let cdfCursor=0;
  for(let i=0;i<40;i++){
    const t=minT+((maxT-minT)*i)/39;
    while(cdfCursor<N&&scenarios[cdfCursor]<=t)cdfCursor++;
    cdf.push({t,prob:(cdfCursor/N)*100});
  }

  // Moda
  const modeBin=histogram.reduce((b,a)=>a.count>b.count?a:b,histogram[0]);
  const mode=modeBin.mid,modeProbPct=(modeBin.count/N)*100;

  // Goal seek
  const goalMean=target-1.645*denomStd;
  const goalMeanPct=simMean>0?((simMean-goalMean)/simMean)*100:0;
  const goalStd=target-simMean>0?(target-simMean)/1.645:0;
  const goalStdPct=denomStd>0?((denomStd-goalStd)/denomStd)*100:0;

  // N recomendado
  const marginSec=Math.max(0.5,0.01*simMean);
  const recMeanN=Math.ceil(((1.96*simStd)/marginSec)**2);
  const pp2=Math.min(0.99,Math.max(0.01,probMeetTarget));
  const recProbN=Math.ceil((1.96*1.96*pp2*(1-pp2))/(0.01*0.01));
  const recommendedN=Math.max(recMeanN,recProbN);

  // Tornado legacy
  const tornado=[
    {name:"Tiempo de ciclo",low:profit(simMean*0.9)-expected,high:profit(simMean*1.1)-expected},
    {name:"Valor producto", low:qty*(price*0.9-simMean*costPerSecond)-expected,high:qty*(price*1.1-simMean*costPerSecond)-expected},
    {name:"Volumen mensual",low:qty*0.9*(price-simMean*costPerSecond)-expected,high:qty*1.1*(price-simMean*costPerSecond)-expected},
    {name:"Costo M.O.",     low:qty*(price-simMean*(avgHourlyCost*0.9)/3600)-expected,high:qty*(price-simMean*(avgHourlyCost*1.1)/3600)-expected},
  ].map(t=>({...t,range:Math.abs(t.high-t.low)})).sort((a,b)=>b.range-a.range);

  let verdict:"capaz"|"aceptable"|"noCapaz"="noCapaz";
  if(probMeetTarget>=0.95&&cpk>=1.33) verdict="capaz";
  else if(probMeetTarget>=0.8||cpk>=1) verdict="aceptable";

  self.postMessage({ type: "progress", pct: 99 });

  self.postMessage({
    type:"result",
    data:{
      scenarios: Array.from(scenarios),
      minT,maxT,mean:simMean,std:simStd,cv,p5,p10,p50,p90,p95,
      probMeetTarget,se,ciLow,ciHigh,
      cpk,cp,cpm,pp,ppk,ppu,cpk_vs_ppk_ratio,
      sigmaLevel,sigmaSix,dpmoTheoretical,dpmo,
      tStat,pValue,rejectH0,
      p5ci,p95ci,sobol,adScores,
      samplingMethod:"LHS + Antithetic (Float64Array)",
      mode,modeProbPct,
      expected,best,worst,annualExpected,var95,cvar,costSaved,costLost,
      baselineExpected,improvementMonthly,improvementAnnual,improvementPct,
      showImprovement: e.data.varReduction>0||e.data.meanShift!==0,
      convergence,recommendedN,histogram,cdf,tornado,
      goalMean,goalMeanPct,goalStd,goalStdPct,
      verdict,target,effMean,effStd,
    }
  });
};
