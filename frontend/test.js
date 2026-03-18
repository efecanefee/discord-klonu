import * as signalR from '@microsoft/signalr';

async function run() {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("http://127.0.0.1:5098/hub/chat")
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

    connection.on("ReceiveMessage", (username, message) => {
        console.log("ReceiveMessage:", username, message);
    });

    try {
        await connection.start();
        console.log("Connected to SignalR!");
        await connection.invoke("JoinRoom", "TestRoom", "TestUser");
        console.log("JoinRoom invoked!");
        
        await connection.invoke("SendMessage", "TestRoom", "TestUser", "Hello World!");
        console.log("SendMessage invoked!");

        setTimeout(() => {
            console.log("Done");
            process.exit(0);
        }, 3000);
    } catch (e) {
        console.error("ERROR CAUGHT", e);
        process.exit(1);
    }
}
run();
