import signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5098/hub/chat")
    .build();

connection.on("ActiveUserCountUpdated", (count) => {
    console.log("ActiveUserCountUpdated:", count);
});

connection.on("roomusers", (users) => {
    console.log("roomusers:", users);
});

connection.on("UserJoined", (user, connId) => {
    console.log("UserJoined:", user, connId);
});

async function run() {
    try {
        await connection.start();
        console.log("Connected!");
        await connection.invoke("JoinRoom", "TestRoom", "TestUser");
        console.log("JoinRoom invoked!");
        
        setTimeout(() => {
            console.log("Done");
            process.exit(0);
        }, 3000);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
