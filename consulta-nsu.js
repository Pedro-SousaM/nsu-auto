const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://api.nuvemfiscal.com.br';
const LOTE = 20; // Limite SEFAZ por hora

const CONFIG = {
    token: process.env.ACCESS_TOKEN,
    cnpj: process.env.CPF_CNPJ,
    uf: process.env.UF,
    ambiente: process.env.AMBIENTE,
    atual: parseInt(process.env.NSU_ATUAL),
    fim: parseInt(process.env.NSU_FIM)
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function consultarNSU(nsu) {
    try {
        const resp = await axios.post(`${BASE_URL}/distribuicao/nfe`, {
            cpf_cnpj: CONFIG.cnpj,
            ambiente: 'producao',
            tipo_consulta: "cons-nsu",
            cons_nsu: nsu
        }, {
            headers: { 
                'Authorization': `Bearer ${CONFIG.token}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const status = resp.data.codigo_status;
        
        if (status === 138) {
            console.log(`✅ NSU ${nsu}: Documento disponibilizado na Nuvem Fiscal`);
        } else {
            console.log(`ℹ️ NSU ${nsu}: Status ${status} - ${resp.data.motivo_status}`);
        }
        
        return true;
        
    } catch (err) {
        // Erro 656 = limite excedido ou bloqueio
        if (err.response?.data?.codigo_status === 656 || err.response?.status === 429) {
            console.log(`⚠️ NSU ${nsu}: Bloqueio SEFAZ (limite pode ter atingido). Abortando.`);
            return false; // Falha no meio, não atualiza arquivo
        }
        
        console.error(`❌ NSU ${nsu}: Erro - ${err.message}`);
        return false;
    }
}

async function executar() {
    console.log(`🔹 CNPJ: ${CONFIG.cnpj.slice(-4).padStart(CONFIG.cnpj.length, '*')}`);
    console.log(`🔹 UF: ${CONFIG.uf} | Ambiente: ${CONFIG.ambiente}`);
    console.log(`🚀 Iniciando do NSU ${CONFIG.atual} (limite de ${LOTE} por hora)\n`);
    
    let ultimoProcessado = CONFIG.atual - 1;
    const fimDoLote = Math.min(CONFIG.atual + LOTE - 1, CONFIG.fim);
    
    for (let nsu = CONFIG.atual; nsu <= fimDoLote; nsu++) {
        const ok = await consultarNSU(nsu);
        
        if (!ok) {
            console.log(`🛑 Interrompido no NSU ${nsu}. Será retomado na próxima execução.`);
            break;
        }
        
        ultimoProcessado = nsu;
        
        // Delay entre consultas (exceto na última)
        if (nsu < fimDoLote) {
            await sleep(1500);
        }
    }
    
    // Salva o próximo NSU a ser consultado
    const proximo = ultimoProcessado + 1;
    fs.writeFileSync('nsu-atual.txt', proximo.toString());
    
    console.log(`\n📊 Progresso salvo: próximo NSU será ${proximo}`);
    
    if (proximo > CONFIG.fim) {
        console.log(`🎉 Concluído! Todos os NSUs até ${CONFIG.fim} foram processados.`);
        // Opcional: deletar o arquivo ou resetar para indicar fim
    } else {
        const restantes = CONFIG.fim - ultimoProcessado;
        console.log(`⏰ Faltam ${restantes} NSUs. Aguardando próxima hora...`);
    }
}

executar().catch(e => {
    console.error("Erro fatal:", e);
    process.exit(1);
});
