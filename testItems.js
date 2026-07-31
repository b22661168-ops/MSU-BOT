// testItems.js

const API_KEY ="gw_c8c888c432bcbba7923a56f7ef491ddfd442a15f67c55354a8f94dbde2f281b0fd7f3bfcb10b2be52cda00c636ed573694a60d13362352f907a0c8e543b6a8cd";
const ASSET_KEY = "CHARd0kai79vjlcc73ddtchg";

async function testItems() {
    try {
        const url = `https://openapi.msu.io/v1rc1/characters/${ASSET_KEY}/items`;

        console.log("Request:");
        console.log(url);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-nxopen-api-key": API_KEY
            }
        });

        const data = await response.json();

        console.log("========== RESULT ==========");
        console.dir(data, {
            depth: null,
            colors: true
        });

    } catch (err) {
        console.error(err);
    }
}

testItems();