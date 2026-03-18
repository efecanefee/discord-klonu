# Stage 1: Build the backend API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app

# Copy csproj and restore dependencies as distinct layers
COPY ["DiscordClone.Api.csproj", "./"]
RUN dotnet restore "./DiscordClone.Api.csproj"

# Build and publish the release
COPY . .
RUN dotnet publish "DiscordClone.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Serve the API on a lightweight runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app

# Expose port 8080 and enforce the listening URL
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

# Retrieve the compiled app from the build stage
COPY --from=build /app/publish .

# Determine the entrypoint
ENTRYPOINT ["dotnet", "DiscordClone.Api.dll"]
