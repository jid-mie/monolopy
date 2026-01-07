import React from "react"
import Build from "./Build"

class PropertyInfo extends React.Component{

  constructor(props){
    super(props)
    this.state = {

    }
  }

  // getDevelopmentCost(property){
  //   if (property.housePrice){
  //     return property.housePrice
  //   }
  //   else{
  //     return "N/A"
  //   }
  // }

  parseDevelopmentLevel(rank){
    switch(rank){
      case 0:
        return "undeveloped"
        break
      case 1:
        return "undeveloped"
        break
      case 2:
        return "1 house"
        break
      case 3:
        return "2 houses"
        break
      case 4:
        return "3 houses"
        break
      case 5:
        return "4 houses"
        break
      case 6:
        return "Hotel"
        break
      default:
        return ""
    }
  }

  render(){

    let name

    let count

    let price

    let currentRent

    let currentHouses

    if (this.props.property && this.props.property.housePrice){

      name = this.props.property.name

      count = this.props.player.countPropertiesInGroup(this.props.property)

      price = this.props.property.housePrice

      currentHouses = this.parseDevelopmentLevel(this.props.property.rentIndex)

      currentRent = this.props.property.rentValues[this.props.property.rentIndex]
    }

    else if (this.props.property){

      name = this.props.property.name

      count = this.props.player.countPropertiesInGroup(this.props.property)

      price = "N/A"

      currentHouses = this.parseDevelopmentLevel(this.props.property.rentIndex)

      currentRent = this.props.property.rentValues[this.props.property.rentIndex]

    }

    return(
      <div className="property-info-div">
        <p><b>Property Name:</b> {name}</p>
        <p><b>No. properties in group owned:</b> {count}</p>
        <p><b>Current development level:</b> {currentHouses}</p>
        <p><b>Current rent:</b> {currentRent}</p>
        <p><b>Development cost:</b> {price}</p>
        <Build 
        player={this.props.player}
        property={this.props.property}/>
      </div>
    )
  }

}

export default PropertyInfo