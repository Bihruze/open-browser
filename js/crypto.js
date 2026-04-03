// js/crypto.js — Web Crypto API + scrypt for OWS vault encryption
// Uses scrypt KDF (N=65536, r=8, p=1) + AES-256-GCM
// Fully compatible with OWS CLI vault v2 format
//
// Scrypt implementation from @noble/hashes (MIT License, Paul Miller)
// Vendored inline because wasm_bindgen(module=...) requires self-contained JS

// ============================================================
// VENDORED: @noble/hashes/scrypt (v2.0.1, MIT)
// ============================================================
function pt(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name==="Uint8Array"}function w(e,t=""){if(!Number.isSafeInteger(e)||e<0){let s=t&&`"${t}" `;throw new Error(`${s}expected integer >= 0, got ${e}`)}}function N(e,t,s=""){let o=pt(e),n=e?.length,r=t!==void 0;if(!o||r&&n!==t){let a=s&&`"${s}" `,c=r?` of length ${t}`:"",i=o?`length=${n}`:`type=${typeof e}`;throw new Error(a+"expected Uint8Array"+c+", got "+i)}return e}function q(e){if(typeof e!="function"||typeof e.create!="function")throw new Error("Hash must wrapped by utils.createHasher");w(e.outputLen),w(e.blockLen)}function R(e,t=!0){if(e.destroyed)throw new Error("Hash instance has been destroyed");if(t&&e.finished)throw new Error("Hash#digest() has already been called")}function ft(e,t){N(e,void 0,"digestInto() output");let s=t.outputLen;if(e.length<s)throw new Error('"digestInto() output" expected to be of length >='+s)}function Q(e){return new Uint32Array(e.buffer,e.byteOffset,Math.floor(e.byteLength/4))}function H(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function K(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}function L(e,t){return e<<32-t|e>>>t}function h(e,t){return e<<t|e>>>32-t>>>0}var yt=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function gt(e){return e<<24&4278190080|e<<8&16711680|e>>>8&65280|e>>>24&255}function wt(e){for(let t=0;t<e.length;t++)e[t]=gt(e[t]);return e}var J=yt?e=>e:wt;function et(e,t=""){return typeof e=="string"?new Uint8Array(new TextEncoder().encode(e)):N(e,void 0,t)}function Z(e,t){if(t!==void 0&&{}.toString.call(t)!=="[object Object]")throw new Error("options must be object or undefined");return Object.assign(e,t)}function it(e,t={}){let s=(n,r)=>e(r).update(n).digest(),o=e(void 0);return s.outputLen=o.outputLen,s.blockLen=o.blockLen,s.create=n=>e(n),Object.assign(s,t),Object.freeze(s)}var xt=e=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,e])});var v=class{oHash;iHash;blockLen;outputLen;finished=!1;destroyed=!1;constructor(t,s){if(q(t),N(s,void 0,"key"),this.iHash=t.create(),typeof this.iHash.update!="function")throw new Error("Expected instance of class which extends utils.Hash");this.blockLen=this.iHash.blockLen,this.outputLen=this.iHash.outputLen;let o=this.blockLen,n=new Uint8Array(o);n.set(s.length>o?t.create().update(s).digest():s);for(let r=0;r<n.length;r++)n[r]^=54;this.iHash.update(n),this.oHash=t.create();for(let r=0;r<n.length;r++)n[r]^=106;this.oHash.update(n),H(n)}update(t){return R(this),this.iHash.update(t),this}digestInto(t){R(this),N(t,this.outputLen,"output"),this.finished=!0,this.iHash.digestInto(t),this.oHash.update(t),this.oHash.digestInto(t),this.destroy()}digest(){let t=new Uint8Array(this.oHash.outputLen);return this.digestInto(t),t}_cloneInto(t){t||=Object.create(Object.getPrototypeOf(this),{});let{oHash:s,iHash:o,finished:n,destroyed:r,blockLen:a,outputLen:c}=this;return t=t,t.finished=n,t.destroyed=r,t.blockLen=a,t.outputLen=c,t.oHash=s._cloneInto(t.oHash),t.iHash=o._cloneInto(t.iHash),t}clone(){return this._cloneInto()}destroy(){this.destroyed=!0,this.oHash.destroy(),this.iHash.destroy()}},nt=(e,t,s)=>new v(e,t).update(s).digest();nt.create=(e,t)=>new v(e,t);function Lt(e,t,s,o){q(e);let n=Z({dkLen:32,asyncTick:10},o),{c:r,dkLen:a,asyncTick:c}=n;if(w(r,"c"),w(a,"dkLen"),w(c,"asyncTick"),r<1)throw new Error("iterations (c) must be >= 1");let i=et(t,"password"),x=et(s,"salt"),b=new Uint8Array(a),f=nt.create(e,i),l=f._cloneInto().update(x);return{c:r,dkLen:a,asyncTick:c,DK:b,PRF:f,PRFSalt:l}}function At(e,t,s,o,n){return e.destroy(),t.destroy(),o&&o.destroy(),H(n),s}function st(e,t,s,o){let{c:n,dkLen:r,DK:a,PRF:c,PRFSalt:i}=Lt(e,t,s,o),x,b=new Uint8Array(4),f=K(b),l=new Uint8Array(c.outputLen);for(let u=1,y=0;y<r;u++,y+=c.outputLen){let d=a.subarray(y,y+c.outputLen);f.setInt32(0,u,!1),(x=i._cloneInto(x)).update(b).digestInto(l),d.set(l.subarray(0,d.length));for(let g=1;g<n;g++){c._cloneInto(x).update(l).digestInto(l);for(let p=0;p<d.length;p++)d[p]^=l[p]}}return At(c,i,a,x,l)}function ht(e,t,s){return e&t^~e&s}function dt(e,t,s){return e&t^e&s^t&s}var tt=class{blockLen;outputLen;padOffset;isLE;buffer;view;finished=!1;length=0;pos=0;destroyed=!1;constructor(t,s,o,n){this.blockLen=t,this.outputLen=s,this.padOffset=o,this.isLE=n,this.buffer=new Uint8Array(t),this.view=K(this.buffer)}update(t){R(this),N(t);let{view:s,buffer:o,blockLen:n}=this,r=t.length;for(let a=0;a<r;){let c=Math.min(n-this.pos,r-a);if(c===n){let i=K(t);for(;n<=r-a;a+=n)this.process(i,a);continue}o.set(t.subarray(a,a+c),this.pos),this.pos+=c,a+=c,this.pos===n&&(this.process(s,0),this.pos=0)}return this.length+=t.length,this.roundClean(),this}digestInto(t){R(this),ft(t,this),this.finished=!0;let{buffer:s,view:o,blockLen:n,isLE:r}=this,{pos:a}=this;s[a++]=128,H(this.buffer.subarray(a)),this.padOffset>n-a&&(this.process(o,0),a=0);for(let f=a;f<n;f++)s[f]=0;o.setBigUint64(n-8,BigInt(this.length*8),r),this.process(o,0);let c=K(t),i=this.outputLen;if(i%4)throw new Error("_sha2: outputLen must be aligned to 32bit");let x=i/4,b=this.get();if(x>b.length)throw new Error("_sha2: outputLen bigger than state");for(let f=0;f<x;f++)c.setUint32(4*f,b[f],r)}digest(){let{buffer:t,outputLen:s}=this;this.digestInto(t);let o=t.slice(0,s);return this.destroy(),o}_cloneInto(t){t||=new this.constructor,t.set(...this.get());let{blockLen:s,buffer:o,length:n,finished:r,destroyed:a,pos:c}=this;return t.destroyed=a,t.finished=r,t.length=n,t.pos=c,n%s&&t.buffer.set(o),t}clone(){return this._cloneInto()}},k=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);var kt=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),E=new Uint32Array(64),ot=class extends tt{constructor(t){super(64,t,8,!1)}get(){let{A:t,B:s,C:o,D:n,E:r,F:a,G:c,H:i}=this;return[t,s,o,n,r,a,c,i]}set(t,s,o,n,r,a,c,i){this.A=t|0,this.B=s|0,this.C=o|0,this.D=n|0,this.E=r|0,this.F=a|0,this.G=c|0,this.H=i|0}process(t,s){for(let f=0;f<16;f++,s+=4)E[f]=t.getUint32(s,!1);for(let f=16;f<64;f++){let l=E[f-15],u=E[f-2],y=L(l,7)^L(l,18)^l>>>3,d=L(u,17)^L(u,19)^u>>>10;E[f]=d+E[f-7]+y+E[f-16]|0}let{A:o,B:n,C:r,D:a,E:c,F:i,G:x,H:b}=this;for(let f=0;f<64;f++){let l=L(c,6)^L(c,11)^L(c,25),u=b+l+ht(c,i,x)+kt[f]+E[f]|0,d=(L(o,2)^L(o,13)^L(o,22))+dt(o,n,r)|0;b=x,x=i,i=c,c=a+u|0,a=r,r=n,n=o,o=u+d|0}o=o+this.A|0,n=n+this.B|0,r=r+this.C|0,a=a+this.D|0,c=c+this.E|0,i=i+this.F|0,x=x+this.G|0,b=b+this.H|0,this.set(o,n,r,a,c,i,x,b)}roundClean(){H(E)}destroy(){this.set(0,0,0,0,0,0,0,0),H(this.buffer)}},rt=class extends ot{A=k[0]|0;B=k[1]|0;C=k[2]|0;D=k[3]|0;E=k[4]|0;F=k[5]|0;G=k[6]|0;H=k[7]|0;constructor(){super(32)}};var ct=it(()=>new rt,xt(1));function lt(e,t,s,o,n,r){let a=e[t++]^s[o++],c=e[t++]^s[o++],i=e[t++]^s[o++],x=e[t++]^s[o++],b=e[t++]^s[o++],f=e[t++]^s[o++],l=e[t++]^s[o++],u=e[t++]^s[o++],y=e[t++]^s[o++],d=e[t++]^s[o++],g=e[t++]^s[o++],p=e[t++]^s[o++],A=e[t++]^s[o++],z=e[t++]^s[o++],W=e[t++]^s[o++],X=e[t++]^s[o++],m=a,B=c,I=i,U=x,S=b,C=f,F=l,D=u,_=y,T=d,G=g,V=p,O=A,M=z,j=W,P=X;for(let at=0;at<8;at+=2)S^=h(m+O|0,7),_^=h(S+m|0,9),O^=h(_+S|0,13),m^=h(O+_|0,18),T^=h(C+B|0,7),M^=h(T+C|0,9),B^=h(M+T|0,13),C^=h(B+M|0,18),j^=h(G+F|0,7),I^=h(j+G|0,9),F^=h(I+j|0,13),G^=h(F+I|0,18),U^=h(P+V|0,7),D^=h(U+P|0,9),V^=h(D+U|0,13),P^=h(V+D|0,18),B^=h(m+U|0,7),I^=h(B+m|0,9),U^=h(I+B|0,13),m^=h(U+I|0,18),F^=h(C+S|0,7),D^=h(F+C|0,9),S^=h(D+F|0,13),C^=h(S+D|0,18),V^=h(G+T|0,7),_^=h(V+G|0,9),T^=h(_+V|0,13),G^=h(T+_|0,18),O^=h(P+j|0,7),M^=h(O+P|0,9),j^=h(M+O|0,13),P^=h(j+M|0,18);n[r++]=a+m|0,n[r++]=c+B|0,n[r++]=i+I|0,n[r++]=x+U|0,n[r++]=b+S|0,n[r++]=f+C|0,n[r++]=l+F|0,n[r++]=u+D|0,n[r++]=y+_|0,n[r++]=d+T|0,n[r++]=g+G|0,n[r++]=p+V|0,n[r++]=A+O|0,n[r++]=z+M|0,n[r++]=W+j|0,n[r++]=X+P|0}function $(e,t,s,o,n){let r=o+0,a=o+16*n;for(let c=0;c<16;c++)s[a+c]=e[t+(2*n-1)*16+c];for(let c=0;c<n;c++,r+=16,t+=16)lt(s,a,e,t,s,r),c>0&&(a+=16),lt(s,r,e,t+=16,s,a)}function bt(e,t,s){let o=Z({dkLen:32,asyncTick:10,maxmem:1073742848},s),{N:n,r,p:a,dkLen:c,asyncTick:i,maxmem:x,onProgress:b}=o;if(w(n,"N"),w(r,"r"),w(a,"p"),w(c,"dkLen"),w(i,"asyncTick"),w(x,"maxmem"),b!==void 0&&typeof b!="function")throw new Error("progressCb must be a function");let f=128*r,l=f/4,u=Math.pow(2,32);if(n<=1||(n&n-1)!==0||n>u)throw new Error('"N" expected a power of 2, and 2^1 <= N <= 2^32');if(a<1||a>(u-1)*32/f)throw new Error('"p" expected integer 1..((2^32 - 1) * 32) / (128 * r)');if(c<1||c>(u-1)*32)throw new Error('"dkLen" expected integer 1..(2^32 - 1) * 32');if(f*(n+a)>x)throw new Error('"maxmem" limit was hit, expected 128*r*(N+p) <= "maxmem"='+x);let d=st(ct,e,t,{c:1,dkLen:f*a}),g=Q(d),p=Q(new Uint8Array(f*n)),A=Q(new Uint8Array(f));return{N:n,r,p:a,dkLen:c,blockSize32:l,V:p,B32:g,B:d,tmp:A,blockMixCb:()=>{},asyncTick:i}}function ut(e,t,s,o,n){let r=st(ct,e,s,{c:1,dkLen:t});return H(s,o,n),r}function _scrypt(e,t,s){let{N:o,r:n,p:r,dkLen:a,blockSize32:c,V:i,B32:x,B:b,tmp:f}=bt(e,t,s);J(x);for(let u=0;u<r;u++){let y=c*u;for(let d=0;d<c;d++)i[d]=x[y+d];for(let d=0,g=0;d<o-1;d++)$(i,g,i,g+=c,n);$( i,(o-1)*c,x,y,n);for(let d=0;d<o;d++){let g=(x[y+c-16]&o-1)>>>0;for(let p=0;p<c;p++)f[p]=x[y+p]^i[g*c+p];$(f,0,x,y,n)}}return J(x),ut(e,a,b,i,f)}
// ============================================================
// END VENDORED SCRYPT
// ============================================================

// OWS CLI scrypt parameters (production)
const SCRYPT_N = 65536;  // 2^16
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DKLEN = 32;

/**
 * Encrypt plaintext with password using scrypt + AES-256-GCM
 * Returns OWS vault v2 compatible crypto JSON string
 */
export async function encryptKeystore(plaintext, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key using scrypt (matches OWS CLI exactly)
    const derivedKey = _scrypt(enc.encode(password), salt, {
        N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: SCRYPT_DKLEN
    });

    // Import derived bytes as AES-GCM key
    const key = await crypto.subtle.importKey(
        "raw", derivedKey, { name: "AES-GCM" }, false, ["encrypt"]
    );

    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key,
        enc.encode(plaintext)
    );

    // AES-GCM appends 16-byte auth tag to ciphertext — separate them
    const fullCiphertext = new Uint8Array(ciphertextBuf);
    const cipherBytes = fullCiphertext.slice(0, fullCiphertext.length - 16);
    const authTag = fullCiphertext.slice(fullCiphertext.length - 16);

    // OWS vault v2 CryptoEnvelope format (exact match with CLI)
    return JSON.stringify({
        cipher: "aes-256-gcm",
        cipherparams: { iv: toHex(iv) },
        ciphertext: toHex(cipherBytes),
        auth_tag: toHex(authTag),
        kdf: "scrypt",
        kdfparams: {
            dklen: SCRYPT_DKLEN,
            n: SCRYPT_N,
            r: SCRYPT_R,
            p: SCRYPT_P,
            salt: toHex(salt)
        }
    });
}

/**
 * Decrypt OWS vault v2 crypto JSON with password
 * Supports both scrypt (OWS CLI) and pbkdf2 (legacy browser) vaults
 */
export async function decryptKeystore(cryptoJson, password) {
    const ks = JSON.parse(cryptoJson);
    const enc = new TextEncoder();
    const salt = fromHex(ks.kdfparams.salt);
    const iv = fromHex(ks.cipherparams.iv);
    const cipherBytes = fromHex(ks.ciphertext);
    const authTag = fromHex(ks.auth_tag);

    // Reconstruct full ciphertext with auth tag appended (Web Crypto expects this)
    const fullCiphertext = new Uint8Array(cipherBytes.length + authTag.length);
    fullCiphertext.set(cipherBytes);
    fullCiphertext.set(authTag, cipherBytes.length);

    let derivedKey;

    if (ks.kdf === "scrypt") {
        // OWS CLI format — scrypt KDF
        const n = ks.kdfparams.n || SCRYPT_N;
        const r = ks.kdfparams.r || SCRYPT_R;
        const p = ks.kdfparams.p || SCRYPT_P;
        const dklen = ks.kdfparams.dklen || SCRYPT_DKLEN;

        // Downgrade attack protection
        if (n < 1024 || (n & (n - 1)) !== 0) throw new Error('Invalid scrypt N parameter');
        if (r < 8) throw new Error('Invalid scrypt r parameter');
        if (p < 1) throw new Error('Invalid scrypt p parameter');
        if (dklen !== 32) throw new Error('Invalid scrypt dklen parameter');

        derivedKey = _scrypt(enc.encode(password), salt, { N: n, r, p, dkLen: dklen });
    } else if (ks.kdf === "pbkdf2") {
        // Legacy browser format — backward compatibility
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits(
            { name: "PBKDF2", salt, iterations: ks.kdfparams.c || 600000, hash: "SHA-256" },
            keyMaterial, 256
        );
        derivedKey = new Uint8Array(bits);
    } else {
        throw new Error(`Unsupported KDF: ${ks.kdf}`);
    }

    // Import derived bytes as AES-GCM key
    const key = await crypto.subtle.importKey(
        "raw", derivedKey, { name: "AES-GCM" }, false, ["decrypt"]
    );

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key,
        fullCiphertext
    );

    return new TextDecoder().decode(plaintext);
}

function toHex(buf) {
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function fromHex(hex) {
    return new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}
